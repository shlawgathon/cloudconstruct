package gg.growly.cloudconstruct.worker.websocket

import gg.growly.cloudconstruct.worker.globalJson
import io.ktor.websocket.*
import org.bson.Document

class MessageHandler(
    private val connectionManager: ConnectionManager,
    private val repo: WsRepository,
    private val gemini: GeminiService
) {
    private suspend fun handleFileWriteResponse(message: WSMessage.FileWriteResponse, token: String) {
        val componentId = message.componentId ?: "unknown"
        if (message.success) {
            // Notify UI and trigger cluster check using the written spec file
            broadcastToExcalidraw(
                WSMessage.StatusUpdate(
                    componentId = componentId,
                    status = ComponentStatus.CHECKING,
                    message = "Spec saved. Running cluster check..."
                ),
                token
            )
            broadcastToVSC(
                WSMessage.ClusterCheckRequest(
                    componentId = componentId,
                    specFile = message.path
                ),
                token
            )
        } else {
            broadcastToExcalidraw(
                WSMessage.StatusUpdate(
                    componentId = componentId,
                    status = ComponentStatus.FAILURE,
                    message = "Failed to write ${message.path}: ${message.error}"
                ),
                token
            )
        }
    }

    suspend fun handleVSCMessage(message: WSMessage, session: WebSocketSession, token: String) {
        println("[WS][VSC][IN] ${System.currentTimeMillis()} type=${message::class.simpleName}")
        when (message) {
            is WSMessage.FileOperation -> handleFileOperation(message, session)
            is WSMessage.ClusterCheckRequest -> handleClusterCheck(message, session, token)
            is WSMessage.StatusUpdate -> broadcastToExcalidraw(message, token)
            is WSMessage.FileWriteResponse -> handleFileWriteResponse(message, token)
            else -> println("[WS][VSC][WARN] Unhandled message: ${message::class.simpleName}")
        }
    }

    suspend fun handleExcalidrawMessage(message: WSMessage, session: WebSocketSession, token: String) {
        println("[WS][EXCALIDRAW][IN] ${System.currentTimeMillis()} type=${message::class.simpleName}")
        when (message) {
            is WSMessage.WhiteboardUpdate -> handleWhiteboardUpdate(message, token)
            is WSMessage.CodeGenRequest -> handleCodeGeneration(message, session, token)
            else -> println("[WS][EXCALIDRAW][WARN] Unhandled message: ${message::class.simpleName}")
        }
    }

    private suspend fun handleFileOperation(message: WSMessage.FileOperation, session: WebSocketSession) {
        println("[WS][VSC][HANDLE] FileOperation op=${message.operation} path=${message.path}")
        val response = when (message.operation) {
            "list" -> globalJson.encodeToString(mapOf("files" to listOf("file1.ts", "file2.ts")))
            "read" -> globalJson.encodeToString(mapOf("content" to "file content here"))
            "create", "update" -> globalJson.encodeToString(mapOf("success" to true))
            "delete" -> globalJson.encodeToString(mapOf("success" to true))
            "search" -> globalJson.encodeToString(mapOf("results" to listOf("match1", "match2")))
            else -> globalJson.encodeToString(mapOf("error" to "Unknown operation"))
        }
        session.send(Frame.Text(response))
    }

    private suspend fun handleWhiteboardUpdate(message: WSMessage.WhiteboardUpdate, token: String) {
        println("[WS][EXCALIDRAW][HANDLE] WhiteboardUpdate componentId=${message.componentId} elements=${message.elements.size}")
        val state = Document()
            .append("componentId", message.componentId)
            .append("elements", globalJson.encodeToString(message.elements))
            .append("screenshot", message.screenshot)
        repo.saveWhiteboardState(message.componentId, state)
        broadcastToVSC(message, token)
    }

    private suspend fun handleCodeGeneration(message: WSMessage.CodeGenRequest, session: WebSocketSession, token: String) {
        println("[WS][EXCALIDRAW][HANDLE] CodeGenRequest componentId=${message.componentId}")
        val generatedCode = gemini.generateCode(message.prompt, message.context)
        val response = WSMessage.CodeGenResponse(
            componentId = message.componentId,
            code = generatedCode,
            specFile = "generated-spec.yaml",
            status = "success"
        )
        session.send(Frame.Text(globalJson.encodeToString(WSMessage.serializer(), response)))
        broadcastToVSC(response, token)
    }

    private suspend fun handleClusterCheck(message: WSMessage.ClusterCheckRequest, session: WebSocketSession, token: String) {
        println("[WS][VSC][HANDLE] ClusterCheckRequest componentId=${message.componentId} specFile=${message.specFile}")
        val k8sCode = gemini.generateClusterCheck(message.specFile)
        val response = WSMessage.ClusterCheckResponse(
            componentId = message.componentId,
            status = "checking",
            k8sCode = k8sCode,
            errors = null
        )
        session.send(Frame.Text(globalJson.encodeToString(WSMessage.serializer(), response)))
        broadcastToExcalidraw(
            WSMessage.StatusUpdate(
                componentId = message.componentId,
                status = ComponentStatus.CHECKING,
                message = "Running cluster check..."
            ),
            token
        )
    }

    private suspend fun broadcastToVSC(message: WSMessage, includeToken: String? = null) {
        val sessions = connectionManager.getAllVSCSessions()
        val payload = globalJson.encodeToString(WSMessage.serializer(), message)
        sessions.forEach { (token, session) ->
/*            if (token != includeToken)
            {
                println("token mismatch $token $includeToken")
                return@forEach
            }*/
            println("token match $token $session")
            try { session.send(Frame.Text(payload)); println("BROADCASTED TO VSC TO ${payload}") } catch (e: Exception) { e.printStackTrace(); println("[WS][BROADCAST][VSC][ERR] ${e.message}") }
        }
    }

    private suspend fun broadcastToExcalidraw(message: WSMessage, excludeToken: String? = null) {
        val sessions = connectionManager.getAllExcalidrawSessions()
        val payload = globalJson.encodeToString(WSMessage.serializer(), message)
        sessions.forEach { (token, session) ->
//            if (token != excludeToken) {
                try { session.send(Frame.Text(payload)) } catch (e: Exception) { e.printStackTrace(); println("[WS][BROADCAST][EXCALIDRAW][ERR] ${e.message}") }
//            }
        }
    }
}
