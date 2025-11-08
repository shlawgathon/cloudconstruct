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
            try {
                val authFrame = incoming.receive()
                if (authFrame is Frame.Text) {
                    val authMsg = globalJson.decodeFromString<WSMessage.Auth>(authFrame.readText())
                    sessionToken = authMsg.token
                    val sess = connectionManager.validateSession(sessionToken!!)
                    if (sess == null || sess.connectionType != ConnectionManager.ConnectionType.VSC) {
                        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Invalid session"))
                        return@webSocket
                    }
                    connectionManager.addVSCConnection(sessionToken!!, this)
                    for (frame in incoming) {
                        if (frame is Frame.Text) {
                            val text = frame.readText()
                            val message = globalJson.decodeFromString<WSMessage>(text)
                            handler.handleVSCMessage(message, this, sessionToken!!)
                        }
                    }
                }
            } catch (e: Exception) {
                println("VSC WebSocket error: ${e.message}")
            } finally {
                sessionToken?.let { connectionManager.removeVSCConnection(it) }
            }
        }

        webSocket("/ws/excalidraw") {
            var sessionToken: String? = null
            try {
                val authFrame = incoming.receive()
                if (authFrame is Frame.Text) {
                    val authMsg = globalJson.decodeFromString<WSMessage.Auth>(authFrame.readText())
                    sessionToken = authMsg.token
                    val sess = connectionManager.validateSession(sessionToken!!)
                    if (sess == null || sess.connectionType != ConnectionManager.ConnectionType.EXCALIDRAW) {
                        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Invalid session"))
                        return@webSocket
                    }
                    connectionManager.addExcalidrawConnection(sessionToken!!, this)
                    for (frame in incoming) {
                        if (frame is Frame.Text) {
                            val text = frame.readText()
                            val message = globalJson.decodeFromString<WSMessage>(text)
                            handler.handleExcalidrawMessage(message, this, sessionToken!!)
                        }
                    }
                }
            } catch (e: Exception) {
                println("Excalidraw WebSocket error: ${e.message}")
            } finally {
                sessionToken?.let { connectionManager.removeExcalidrawConnection(it) }
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
