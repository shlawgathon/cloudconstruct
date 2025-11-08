import gg.growly.cloudconstruct.worker.UserSession
import gg.growly.cloudconstruct.worker.globalJson
import gg.growly.cloudconstruct.worker.mongoDatabase
import gg.growly.cloudconstruct.worker.websocket.AuthResponse
import gg.growly.cloudconstruct.worker.websocket.ConnectionManager
import gg.growly.cloudconstruct.worker.websocket.GeminiService
import gg.growly.cloudconstruct.worker.websocket.MessageHandler
import gg.growly.cloudconstruct.worker.websocket.WSMessage
import gg.growly.cloudconstruct.worker.websocket.WsRepository
import gg.growly.cloudconstruct.worker.websocket.ChangeDeterminationService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.sessions.*
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.*

fun Application.configureWebSockets() {
    val db = mongoDatabase()
    val connectionManager = ConnectionManager()
    val repo = WsRepository(db)
    val gemini = GeminiService(environment.config)
    val handler = MessageHandler(connectionManager, repo, gemini)
    val changeService = ChangeDeterminationService(repo, connectionManager, gemini)
    changeService.start()

    routing {
        authenticate {
            // Issue short-lived WS session tokens for VSC or Excalidraw
            post("/ws/token") {
                val session = call.sessions.get(UserSession::class) as? UserSession
                val userId = session?.userId ?: return@post call.respond(HttpStatusCode.Unauthorized)
                val type = call.request.queryParameters["type"]?.uppercase() ?: "VSC"
                val connType = try { ConnectionManager.ConnectionType.valueOf(type) } catch (_: Exception) { ConnectionManager.ConnectionType.VSC }
                val token = connectionManager.createSession(userId, connType)
                println("[WS][TOKEN] Issued session token for user=$userId type=$connType token=${token.take(6)}…")
                call.respond(
                    AuthResponse(
                        sessionToken = token,
                        expiresAt = System.currentTimeMillis() + 24 * 60 * 60 * 1000
                    )
                )
            }
        }

        webSocket("/ws/vsc") {
            var sessionToken: String? = null
            var userId: String? = null
            println("[WS][VSC] Connection opened")
            try {
                val authFrame = incoming.receive()
                if (authFrame is Frame.Text) {
                    val raw = authFrame.readText()
                    println("[WS][VSC][AUTH] frameSize=${raw.length}")
                    val authMsg = globalJson.decodeFromString<WSMessage.Auth>(raw)
                    sessionToken = authMsg.token
                    val sess = connectionManager.validateSession(sessionToken!!)
                    if (sess == null || sess.connectionType != ConnectionManager.ConnectionType.VSC) {
                        println("[WS][VSC] Auth failed for token=${sessionToken!!.take(6)}… reason=${if (sess == null) "invalid or expired" else "wrong type"}")
                        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Invalid session"))
                        return@webSocket
                    }
                    userId = sess.userId
                    println("[WS][VSC] Auth OK user=$userId token=${sessionToken!!.take(6)}…")
                    connectionManager.addVSCConnection(sessionToken!!, this)
                    // broadcast counts to this user's sessions
                    val (vCount, eCount) = connectionManager.getUserConnectionCounts(userId!!)
                    val update = WSMessage.ConnectedClientsUpdate(userId!!, vCount, eCount)
                    connectionManager.getSessionsForUser(userId!!).forEach {
                        try { it.send(Frame.Text(globalJson.encodeToString(WSMessage.serializer(), update))) } catch (_: Exception) {}
                    }
                    for (frame in incoming) {
                        if (frame is Frame.Text) {
                            val text = frame.readText()
                            println("[WS][VSC][IN] size=${text.length} head='${text.take(200)}'")
                            val message = runCatching { globalJson.decodeFromString<WSMessage>(text) }
                                .onFailure { it.printStackTrace(); println("[WS][VSC][DECODE][ERR] ${it.message}") }
                                .getOrNull() ?: continue
                            println("[WS][VSC][DECODE] type=${message::class.simpleName}")
                            handler.handleVSCMessage(message, this, sessionToken!!)
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                println("[WS][VSC][ERR] ${e.message}")
            } finally {
                sessionToken?.let { connectionManager.removeVSCConnection(it) }
                println("[WS][VSC] Connection closed token=${sessionToken?.take(6)}… user=$userId")
                userId?.let {
                    val (vCount, eCount) = connectionManager.getUserConnectionCounts(it)
                    val update = WSMessage.ConnectedClientsUpdate(it, vCount, eCount)
                    connectionManager.getSessionsForUser(it).forEach { sess ->
                        try { sess.send(Frame.Text(globalJson.encodeToString(WSMessage.serializer(), update))) } catch (_: Exception) {}
                    }
                }
            }
        }

        webSocket("/ws/excalidraw") {
            var sessionToken: String? = null
            var userId: String? = null
            println("[WS][EXCALIDRAW] Connection opened")
            try {
                val authFrame = incoming.receive()
                if (authFrame is Frame.Text) {
                    val raw = authFrame.readText()
                    println("[WS][EXCALIDRAW][AUTH] frameSize=${raw.length}")
                    val authMsg = globalJson.decodeFromString<WSMessage.Auth>(raw)
                    sessionToken = authMsg.token
                    val sess = connectionManager.validateSession(sessionToken!!)
                    if (sess == null || sess.connectionType != ConnectionManager.ConnectionType.EXCALIDRAW) {
                        println("[WS][EXCALIDRAW] Auth failed for token=${sessionToken!!.take(6)}… reason=${if (sess == null) "invalid or expired" else "wrong type"}")
                        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Invalid session"))
                        return@webSocket
                    }
                    userId = sess.userId
                    println("[WS][EXCALIDRAW] Auth OK user=$userId token=${sessionToken!!.take(6)}…")
                    connectionManager.addExcalidrawConnection(sessionToken!!, this)
                    // broadcast counts to this user's sessions
                    val (vCount, eCount) = connectionManager.getUserConnectionCounts(userId!!)
                    val update = WSMessage.ConnectedClientsUpdate(userId!!, vCount, eCount)
                    connectionManager.getSessionsForUser(userId!!).forEach {
                        try { it.send(Frame.Text(globalJson.encodeToString(WSMessage.serializer(), update))) } catch (_: Exception) {}
                    }
                    for (frame in incoming) {
                        if (frame is Frame.Text) {
                            val text = frame.readText()
                            println("[WS][EXCALIDRAW][IN] size=${text.length} head='${text.take(200)}'")
                            val message = runCatching { globalJson.decodeFromString<WSMessage>(text) }
                                .onFailure { it.printStackTrace(); println("[WS][EXCALIDRAW][DECODE][ERR] ${it.message}") }
                                .getOrNull() ?: continue
                            println("[WS][EXCALIDRAW][DECODE] type=${message::class.simpleName}")
                            handler.handleExcalidrawMessage(message, this, sessionToken!!)
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                println("[WS][EXCALIDRAW][ERR] ${e.message}")
            } finally {
                sessionToken?.let { connectionManager.removeExcalidrawConnection(it) }
                println("[WS][EXCALIDRAW] Connection closed token=${sessionToken?.take(6)}… user=$userId")
                userId?.let {
                    val (vCount, eCount) = connectionManager.getUserConnectionCounts(it)
                    val update = WSMessage.ConnectedClientsUpdate(it, vCount, eCount)
                    connectionManager.getSessionsForUser(it).forEach { sess ->
                        try { sess.send(Frame.Text(globalJson.encodeToString(WSMessage.serializer(), update))) } catch (_: Exception) {}
                    }
                }
            }
        }

        get("/health/ws") {
            call.respond(
                mapOf(
                    "status" to "healthy",
                    "vscConnections" to connectionManager.getAllVSCSessions().size.toString(),
                    "excalidrawConnections" to connectionManager.getAllExcalidrawSessions().size.toString()
                )
            )
        }
    }
}
