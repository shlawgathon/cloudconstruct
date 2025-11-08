package gg.growly.cloudconstruct.worker.websocket

import gg.growly.cloudconstruct.worker.globalJson
import kotlinx.coroutines.*
import org.bson.Document
import java.security.MessageDigest

/**
 * Periodically polls whiteboard states and detects changes each 1 second.
 * On change, it triggers Gemini code generation (multimodal: JSON + optional image)
 * and broadcasts:
 *  - StatusUpdate to Excalidraw (LOADING/SUCCESS/FAILURE)
 *  - WhiteboardChangeDetected to both sides (for visibility)
 *  - FileWriteRequest to VSC with Kubernetes YAML content
 */
class ChangeDeterminationService(
    private val repo: WsRepository,
    private val connections: ConnectionManager,
    private val gemini: GeminiService,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
) {
    private var job: Job? = null
    private val lastHashes = mutableMapOf<String, String>()

    fun start() {
        if (job != null) return
        job = scope.launch {
            while (isActive) {
                runCatching { pollOnce() }
                    .onFailure { println("ChangeDeterminationService error: ${it.message}") }
                delay(1000)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    private suspend fun pollOnce() {
        val docs = repo.listWhiteboardStates()
        for (doc in docs) {
            val componentId = doc.getString("projectId") ?: continue
            val elementsJson = doc.getString("elements") ?: continue
            val screenshot = doc.getString("screenshot")

            val hash = sha256(elementsJson + (screenshot ?: ""))
            val last = lastHashes[componentId]
            if (last == hash) continue

            lastHashes[componentId] = hash

            val elements: List<WhiteboardElement> = runCatching {
                globalJson.decodeFromString<List<WhiteboardElement>>(elementsJson)
            }.getOrElse { emptyList() }

            // Broadcast LOADING status
            broadcastToExcalidraw(
                WSMessage.StatusUpdate(componentId, ComponentStatus.LOADING, "Detected changes, generating specs...")
            )

            // Generate code using Gemini
            val ctx = CodeGenContext(
                whiteboard = elements,
                files = emptyList(),
                previousComponents = null,
                screenshotBase64 = screenshot
            )

            val prompt = "Generate Kubernetes specs for changed whiteboard components."

            val generated = runCatching { gemini.generateCode(prompt, ctx) }
            if (generated.isSuccess) {
                val yaml = generated.getOrThrow()
                val name = inferName(elements) ?: componentId
                val path = "k8s/${name}.yaml"

                // Broadcast change info
                broadcastToBoth(
                    WSMessage.WhiteboardChangeDetected(
                        componentId = componentId,
                        diffSummary = "Whiteboard updated (${elements.size} elements).",
                        changedElementIds = elements.mapNotNull { it.id }
                    )
                )
                // Ask VSC to write/update a file
                broadcastToVSC(
                    WSMessage.FileWriteRequest(path = path, content = yaml, overwrite = true)
                )

                // Broadcast SUCCESS status
                broadcastToExcalidraw(
                    WSMessage.StatusUpdate(componentId, ComponentStatus.SUCCESS, "Specs generated: $path")
                )
            } else {
                broadcastToExcalidraw(
                    WSMessage.StatusUpdate(componentId, ComponentStatus.FAILURE, "Codegen failed: ${generated.exceptionOrNull()?.message}")
                )
            }
        }
    }

    private fun inferName(elements: List<WhiteboardElement>): String? {
        val label = elements.firstOrNull { !it.text.isNullOrBlank() }?.text
        return label?.lowercase()?.replace(" ", "-")
    }

    private fun sha256(text: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        val bytes = md.digest(text.toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private suspend fun broadcastToVSC(message: WSMessage) {
        val sessions = connections.getAllVSCSessions()
        val payload = globalJson.encodeToString(WSMessage.serializer(), message)
        sessions.forEach { (_, session) ->
            runCatching { session.send(io.ktor.websocket.Frame.Text(payload)) }
                .onFailure { println("Failed to broadcast to VSC: ${it.message}") }
        }
    }

    private suspend fun broadcastToExcalidraw(message: WSMessage) {
        val sessions = connections.getAllExcalidrawSessions()
        val payload = globalJson.encodeToString(WSMessage.serializer(), message)
        sessions.forEach { (_, session) ->
            runCatching { session.send(io.ktor.websocket.Frame.Text(payload)) }
                .onFailure { println("Failed to broadcast to Excalidraw: ${it.message}") }
        }
    }

    private suspend fun broadcastToBoth(message: WSMessage) {
        broadcastToVSC(message)
        broadcastToExcalidraw(message)
    }
}
