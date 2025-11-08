package gg.growly.cloudconstruct.worker.websocket

import io.ktor.websocket.*
import kotlinx.serialization.json.Json
import org.bson.Document

class MessageHandler(
    private val connectionManager: ConnectionManager,
    private val repo: WsRepository,
    private val gemini: GeminiService
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    suspend fun handleVSCMessage(message: WSMessage, session: WebSocketSession, token: String) {
        when (message) {
            is WSMessage.FileOperation -> handleFileOperation(message, session)
            is WSMessage.ClusterCheckRequest -> handleClusterCheck(message, session, token)
            is WSMessage.StatusUpdate -> broadcastToExcalidraw(message, token)
            else -> {}
        }
    }

    suspend fun handleExcalidrawMessage(message: WSMessage, session: WebSocketSession, token: String) {
        when (message) {
            is WSMessage.WhiteboardUpdate -> handleWhiteboardUpdate(message, token)
            is WSMessage.CodeGenRequest -> handleCodeGeneration(message, session, token)
            else -> {}
        }
    }

    private suspend fun handleFileOperation(message: WSMessage.FileOperation, session: WebSocketSession) {
        val response = when (message.operation) {
            "list" -> json.encodeToString(mapOf("files" to listOf("file1.ts", "file2.ts")))
            "read" -> json.encodeToString(mapOf("content" to "file content here"))
            "create", "update" -> json.encodeToString(mapOf("success" to true))
            "delete" -> json.encodeToString(mapOf("success" to true))
            "search" -> json.encodeToString(mapOf("results" to listOf("match1", "match2")))
            else -> json.encodeToString(mapOf("error" to "Unknown operation"))
        }
        session.send(Frame.Text(response))
    }

    private suspend fun handleWhiteboardUpdate(message: WSMessage.WhiteboardUpdate, token: String) {
        val state = Document()
            .append("componentId", message.componentId)
            .append("elements", json.encodeToString(message.elements))
            .append("screenshot", message.screenshot)
        repo.saveWhiteboardState(message.componentId, state)
        broadcastToVSC(message, token)
    }

    private suspend fun handleCodeGeneration(message: WSMessage.CodeGenRequest, session: WebSocketSession, token: String) {
        val generatedCode = gemini.generateCode(message.prompt, message.context)
        val response = WSMessage.CodeGenResponse(
            componentId = message.componentId,
            code = generatedCode,
            specFile = "generated-spec.yaml",
            status = "success"
        )
        session.send(Frame.Text(json.encodeToString(response)))
        broadcastToVSC(response, token)
    }

    private suspend fun handleClusterCheck(message: WSMessage.ClusterCheckRequest, session: WebSocketSession, token: String) {
        val k8sCode = gemini.generateClusterCheck(message.specFile)
        val response = WSMessage.ClusterCheckResponse(
            componentId = message.componentId,
            status = "checking",
            k8sCode = k8sCode,
            errors = null
        )
        session.send(Frame.Text(json.encodeToString(response)))
        broadcastToExcalidraw(
            WSMessage.StatusUpdate(
                componentId = message.componentId,
                status = ComponentStatus.CHECKING,
                message = "Running cluster check..."
            ),
            token
        )
    }

    private suspend fun broadcastToVSC(message: WSMessage, excludeToken: String? = null) {
        val sessions = connectionManager.getAllVSCSessions()
        val payload = json.encodeToString(message)
        sessions.forEach { (token, session) ->
            if (token != excludeToken) {
                try { session.send(Frame.Text(payload)) } catch (e: Exception) { println("Failed to broadcast to VSC: ${e.message}") }
            }
        }
    }

    private suspend fun broadcastToExcalidraw(message: WSMessage, excludeToken: String? = null) {
        val sessions = connectionManager.getAllExcalidrawSessions()
        val payload = json.encodeToString(message)
        sessions.forEach { (token, session) ->
            if (token != excludeToken) {
                try { session.send(Frame.Text(payload)) } catch (e: Exception) { println("Failed to broadcast to Excalidraw: ${e.message}") }
            }
        }
    }
}
