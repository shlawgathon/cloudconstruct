package gg.growly.cloudconstruct.worker.websocket

import kotlinx.serialization.SerialName
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
    @SerialName("auth")
    data class Auth(val token: String) : WSMessage()

    // Broadcast current connected client counts for the authenticated user
    @Serializable
    @SerialName("connectedClientsUpdate")
    data class ConnectedClientsUpdate(
        val userId: String,
        val vsc: Int,
        val excalidraw: Int
    ) : WSMessage()

    @Serializable
    @SerialName("fileOperation")
    data class FileOperation(
        val operation: String, // list, read, create, update, delete, search
        val path: String? = null,
        val content: String? = null,
        val searchQuery: String? = null
    ) : WSMessage()

    // New explicit file listing for worker -> VSC and VSC -> worker
    @Serializable
    @SerialName("fileListRequest")
    data class FileListRequest(
        val requestId: String? = null
    ) : WSMessage()

    @Serializable
    @SerialName("fileListResponse")
    data class FileListResponse(
        val requestId: String? = null,
        val files: List<String> = emptyList()
    ) : WSMessage()

    // Worker suggests a path chosen (possibly with Gemini involvement)
    @Serializable
    @SerialName("specPathSuggestion")
    data class SpecPathSuggestion(
        val componentId: String,
        val suggestedPath: String,
        val reason: String? = null
    ) : WSMessage()

    @Serializable
    @SerialName("fileWriteRequest")
    data class FileWriteRequest(
        val path: String,
        val content: String,
        val overwrite: Boolean = true,
        val componentId: String? = null
    ) : WSMessage()

    @Serializable
    @SerialName("fileWriteResponse")
    data class FileWriteResponse(
        val path: String,
        val content: String,
        val success: Boolean,
        val error: String? = null,
        val componentId: String? = null
    ) : WSMessage()

    @Serializable
    @SerialName("whiteboardUpdate")
    data class WhiteboardUpdate(
        val componentId: String,
        val elements: List<WhiteboardElement>,
        val screenshot: String? = null // base64 encoded
    ) : WSMessage()

    @Serializable
    @SerialName("whiteboardChangeDetected")
    data class WhiteboardChangeDetected(
        val componentId: String,
        val diffSummary: String,
        val changedElementIds: List<String>
    ) : WSMessage()

    @Serializable
    @SerialName("statusUpdate")
    data class StatusUpdate(
        val componentId: String,
        val status: ComponentStatus,
        val message: String? = null
    ) : WSMessage()

    @Serializable
    @SerialName("codeGenRequest")
    data class CodeGenRequest(
        val prompt: String,
        val context: CodeGenContext,
        val componentId: String
    ) : WSMessage()

    @Serializable
    @SerialName("codeGenResponse")
    data class CodeGenResponse(
        val componentId: String,
        val code: String,
        val specFile: String,
        val status: String
    ) : WSMessage()

    // Cluster apply (worker -> VSC) and response (VSC -> worker)
    @Serializable
    @SerialName("clusterApplyRequest")
    data class ClusterApplyRequest(
        val componentId: String,
        val specFile: String,
        val k8sCode: String? = null
    ) : WSMessage()

    @Serializable
    @SerialName("clusterApplyResponse")
    data class ClusterApplyResponse(
        val componentId: String,
        val specFile: String,
        val success: Boolean,
        val error: String? = null
    ) : WSMessage()

    // Periodic status poll messages
    @Serializable
    @SerialName("clusterStatusPollRequest")
    data class ClusterStatusPollRequest(
        val componentId: String,
        val specFile: String
    ) : WSMessage()

    @Serializable
    @SerialName("clusterStatusPollResponse")
    data class ClusterStatusPollResponse(
        val componentId: String,
        val specFile: String,
        val statusJson: String,
        val terminal: Boolean = false,
        val success: Boolean? = null,
        val error: String? = null
    ) : WSMessage()

    // Richer Excalidraw component update rendered from status
    @Serializable
    @SerialName("statusComponentUpdate")
    data class StatusComponentUpdate(
        val componentId: String,
        val elementsJson: String
    ) : WSMessage()

    @Serializable
    @SerialName("clusterCheckRequest")
    data class ClusterCheckRequest(
        val componentId: String,
        val specFile: String,
        val k8sCode: String
    ) : WSMessage()

    @Serializable
    @SerialName("clusterCheckResponse")
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
    val previousComponents: List<String>? = null,
    val screenshotBase64: String? = null
)

@Serializable
enum class ComponentStatus {
    LOADING, SUCCESS, FAILURE, CHECKING, READY
}
