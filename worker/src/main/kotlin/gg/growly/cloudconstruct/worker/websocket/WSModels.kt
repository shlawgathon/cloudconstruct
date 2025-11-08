package gg.growly.cloudconstruct.worker.websocket

import kotlinx.serialization.Serializable

@Serializable
data class AuthRequest(
    val username: String,
    val password: String
)

@Serializable
data class AuthResponse(
    val sessionToken: String,
    val expiresAt: Long
)

@Serializable
sealed class WSMessage {
    @Serializable
    data class Auth(val token: String) : WSMessage()

    @Serializable
    data class FileOperation(
        val operation: String, // list, read, create, update, delete, search
        val path: String? = null,
        val content: String? = null,
        val searchQuery: String? = null
    ) : WSMessage()

    @Serializable
    data class WhiteboardUpdate(
        val componentId: String,
        val elements: List<WhiteboardElement>,
        val screenshot: String? = null // base64 encoded
    ) : WSMessage()

    @Serializable
    data class StatusUpdate(
        val componentId: String,
        val status: ComponentStatus,
        val message: String? = null
    ) : WSMessage()

    @Serializable
    data class CodeGenRequest(
        val prompt: String,
        val context: CodeGenContext,
        val componentId: String
    ) : WSMessage()

    @Serializable
    data class CodeGenResponse(
        val componentId: String,
        val code: String,
        val specFile: String,
        val status: String
    ) : WSMessage()

    @Serializable
    data class ClusterCheckRequest(
        val componentId: String,
        val specFile: String
    ) : WSMessage()

    @Serializable
    data class ClusterCheckResponse(
        val componentId: String,
        val status: String,
        val k8sCode: String? = null,
        val errors: List<String>? = null
    ) : WSMessage()
}

@Serializable
data class WhiteboardElement(
    val id: String,
    val type: String,
    val x: Double,
    val y: Double,
    val width: Double? = null,
    val height: Double? = null,
    val text: String? = null,
    val points: List<Point>? = null
)

@Serializable
data class Point(val x: Double, val y: Double)

@Serializable
data class CodeGenContext(
    val whiteboard: List<WhiteboardElement>,
    val files: List<String>,
    val previousComponents: List<String>? = null
)

@Serializable
enum class ComponentStatus {
    LOADING, SUCCESS, FAILURE, CHECKING, READY
}
