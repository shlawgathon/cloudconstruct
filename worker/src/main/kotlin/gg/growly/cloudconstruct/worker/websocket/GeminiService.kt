package gg.growly.cloudconstruct.worker.websocket

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.timeout
import io.ktor.client.request.post
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.client.request.setBody
import io.ktor.server.config.ApplicationConfig
import io.ktor.util.StringValues
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

class GeminiService(
    private val config: ApplicationConfig,
    private val http: HttpClient = HttpClient(CIO) { install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) } }
) {
    private val apiKey: String? = config.propertyOrNull("gemini.apiKey")?.getString()
    private val modelName: String = config.propertyOrNull("gemini.model")?.getString() ?: "gemini-2.5-pro"
    private val endpoint: String = "https://generativelanguage.googleapis.com/v1beta/models/$modelName:generateContent?key=$apiKey"

    suspend fun suggestSpecPath(context: CodeGenContext, yaml: String, existingFiles: List<String> = emptyList()): String {
        require(!apiKey.isNullOrBlank()) { "gemini.apiKey is required for suggestSpecPath()" }
        // Ask Gemini to propose a sane, idempotent file path under k8s/, preferring reuse of existing similar files
        val parts = mutableListOf<JsonObject>()
        parts += JsonObject(mapOf("text" to JsonPrimitive("You propose a single Kubernetes spec path under the 'k8s/' directory for the component described. Respond with just the relative path string. Prefer reusing an existing file if it likely matches the component; otherwise propose a new concise, kebab-case name.")))
        parts += JsonObject(mapOf("text" to JsonPrimitive("Context whiteboard elements (JSON):")))
        parts += JsonObject(mapOf("text" to JsonPrimitive(Json.encodeToString(context.whiteboard))))
        parts += JsonObject(mapOf("text" to JsonPrimitive("Existing files (newline separated):\n" + existingFiles.joinToString("\n"))))
        parts += JsonObject(mapOf("text" to JsonPrimitive("YAML draft (if any):\n$yaml")))
        val req = GeminiRequest(contents = listOf(Content(parts = parts)))
        val resp: GeminiResponse = http.post(endpoint) {
            contentType(ContentType.Application.Json)
            setBody(req)
        }.body()
        val path = resp.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text?.trim()
        require(!path.isNullOrBlank()) { "Gemini returned empty path" }
        return path
    }

    suspend fun generateCode(prompt: String, context: CodeGenContext): String {
        require(!apiKey.isNullOrBlank()) { "gemini.apiKey is required for generateCode()" }
        val parts = mutableListOf<JsonObject>()
        parts += JsonObject(mapOf("text" to JsonPrimitive("You are a code generator that outputs ONLY Kubernetes YAML manifests. Generate production-ready k8s specs for the described component(s). Return only valid YAML (you may output multi-doc with ---).")))
        parts += JsonObject(mapOf("text" to JsonPrimitive("Prompt: $prompt")))
        parts += JsonObject(mapOf("text" to JsonPrimitive("Whiteboard elements JSON:")))
        parts += JsonObject(mapOf("text" to JsonPrimitive(Json.encodeToString(context.whiteboard))))
        if (!context.screenshotBase64.isNullOrBlank()) {
            parts += JsonObject(mapOf(
                "inline_data" to JsonObject(
                    mapOf(
                        "mime_type" to JsonPrimitive("image/png"),
                        "data" to JsonPrimitive(context.screenshotBase64)
                    )
                )
            ))
        }
        val req = GeminiRequest(contents = listOf(Content(parts = parts)))
        val resp: GeminiResponse = http.post(endpoint) {
            contentType(ContentType.Application.Json)
            setBody(req)
        }.body()
        val text = resp.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text?.trim()
        require(!text.isNullOrBlank()) { "Gemini returned empty YAML" }
        return text
    }

    suspend fun analyzeWhiteboard(
        elements: List<WhiteboardElement>,
        screenshot: String? = null
    ): String {
        require(!apiKey.isNullOrBlank()) { "gemini.apiKey is required for analyzeWhiteboard()" }
        val parts = mutableListOf<JsonObject>()
        parts += JsonObject(mapOf("text" to JsonPrimitive("Summarize the whiteboard components succinctly.")))
        parts += JsonObject(mapOf("text" to JsonPrimitive(Json.encodeToString(elements))))
        if (!screenshot.isNullOrBlank()) {
            parts += JsonObject(mapOf(
                "inline_data" to JsonObject(
                    mapOf(
                        "mime_type" to JsonPrimitive("image/png"),
                        "data" to JsonPrimitive(screenshot)
                    )
                )
            ))
        }
        val req = GeminiRequest(contents = listOf(Content(parts = parts)))
        val resp: GeminiResponse = http.post(endpoint) {
            contentType(ContentType.Application.Json)
            setBody(req)
        }.body()
        val text = resp.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text?.trim()
        require(!text.isNullOrBlank()) { "Gemini returned empty analysis" }
        return text
    }

    suspend fun generateClusterCheck(specFile: String): String {
        require(!apiKey.isNullOrBlank()) { "gemini.apiKey is required for generateClusterCheck()" }
        // Ask Gemini to generate JS that uses typed k8s clients for readiness, not generic KubernetesObjectApi for status.
        // It may parse YAML only to extract targets (kind/name/namespace), but readiness must come from typed API/status.
        val parts = mutableListOf<JsonObject>()
        parts += JsonObject(mapOf("text" to JsonPrimitive(
            "Write a minimal Node.js snippet using '@kubernetes/client-node' that returns the JSON status for a specific service . " +
                "Return only the essential code (max 10 lines) - no error handling, no comments, no module exports. " +
                "Just load config, create client, check pod statuses, and console.log the result. The following k8s component you are generating code to describe for is: $specFile"
        )))
        val req = GeminiRequest(contents = listOf(Content(parts = parts)))
        val resp: GeminiResponse = http.post(endpoint) {
            timeout {
                requestTimeoutMillis = 60_000L
                socketTimeoutMillis = 60_000L
                connectTimeoutMillis = 60_000L
            }
            contentType(ContentType.Application.Json)
            setBody(req)
        }.body()
        val js = resp.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text?.trim()
        require(!js.isNullOrBlank()) { "Gemini returned empty cluster check module" }
        return js
    }

    suspend fun generateStatusComponent(statusJson: String, context: CodeGenContext): String {
        require(!apiKey.isNullOrBlank()) { "gemini.apiKey is required for generateStatusComponent()" }
        // Ask Gemini to produce an Excalidraw clipboard JSON (elements only) that visualizes readiness per component
        val parts = mutableListOf<JsonObject>()
        parts += JsonObject(mapOf("text" to JsonPrimitive("You output ONLY a valid Excalidraw clipboard JSON object with an 'elements' array, suitable for paste. Create a compact status overlay summarizing Kubernetes component readiness from the provided JSON.")))
        parts += JsonObject(mapOf("text" to JsonPrimitive("Cluster status JSON:")))
        parts += JsonObject(mapOf("text" to JsonPrimitive(statusJson)))
        parts += JsonObject(mapOf("text" to JsonPrimitive("Whiteboard elements (for placement hints):")))
        parts += JsonObject(mapOf("text" to JsonPrimitive(Json.encodeToString(context.whiteboard))))
        val req = GeminiRequest(contents = listOf(Content(parts = parts)))
        val resp: GeminiResponse = http.post(endpoint) {
            contentType(ContentType.Application.Json)
            setBody(req)
        }.body()
        val json = resp.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text?.trim()
        require(!json.isNullOrBlank()) { "Gemini returned empty status component" }
        return json
    }

    private fun inferName(context: CodeGenContext): String? {
        val label = context.whiteboard.firstOrNull { it.text?.isNotBlank() == true }?.text
        return label?.lowercase()?.replace(" ", "-")
    }
}

@Serializable
private data class GeminiRequest(val contents: List<Content>)

@Serializable
private data class Content(val parts: List<JsonObject>)

@Serializable
private data class GeminiResponse(val candidates: List<Candidate>? = null)

@Serializable
private data class Candidate(val content: CandidateContent? = null)

@Serializable
private data class CandidateContent(val parts: List<Part>? = null)

@Serializable
private data class Part(val text: String? = null)
