package gg.growly.cloudconstruct.worker.websocket

import gg.growly.cloudconstruct.worker.environment.Env
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
    private val apiKey: String = Env.getRequired("GEMINI_API_KEY")
    private val modelName: String = Env.getRequired("GEMINI_MODEL")
    private val endpoint: String = "https://generativelanguage.googleapis.com/v1beta/models/$modelName:generateContent?key=$apiKey"

    suspend fun suggestSpecPath(context: CodeGenContext, yaml: String, existingFiles: List<String> = emptyList()): String {
        require(!apiKey.isNullOrBlank()) { "gemini.apiKey is required for suggestSpecPath()" }
        // Ask Gemini to propose a strictly formatted, concise path under k8s/, with a strong bias to reuse.
        val parts = mutableListOf<JsonObject>()
        parts += JsonObject(mapOf("text" to JsonPrimitive(
            "Task: Output ONLY a single relative file path under 'k8s/' for the Kubernetes spec. No quotes, no prose, no backticks.\n" +
            "Rules:\n" +
            "- Prefer reusing an existing file if it likely matches.\n" +
            "- Otherwise propose a concise kebab-case filename.\n" +
            "- Allowed chars: lowercase a-z, 0-9, dashes (-), slashes (/), and a single .yaml extension.\n" +
            "- No spaces, commas, underscores, or parentheses.\n" +
            "- Keep base filename short and meaningful (8–30 chars).\n" +
            "- Up to 3 subdirectories max.\n" +
            "- Must end with .yaml.\n" +
            "Examples (bad → good):\n" +
            "  k8s/web-app-nginx-index-html-static-served hello-world.yaml → k8s/web/nginx-static.yaml\n" +
            "  k8s/My Service.yaml → k8s/service/my-service.yaml\n"
        )))
        parts += JsonObject(mapOf("text" to JsonPrimitive("Context whiteboard elements (JSON):")))
        parts += JsonObject(mapOf("text" to JsonPrimitive(Json.encodeToString(context.whiteboard))))
        parts += JsonObject(mapOf("text" to JsonPrimitive("Existing files (newline separated):\n" + existingFiles.joinToString("\n"))))
        parts += JsonObject(mapOf("text" to JsonPrimitive("YAML draft (if any):\n$yaml")))
        val req = GeminiRequest(contents = listOf(Content(parts = parts)))
        val resp: GeminiResponse = http.post(endpoint) {
            contentType(ContentType.Application.Json)
            setBody(req)
        }.body()
        val raw = resp.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text?.trim()
        require(!raw.isNullOrBlank()) { "Gemini returned empty path" }
        return sanitizePathSuggestion(raw, existingFiles)
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

    suspend fun generateClusterCheck(specFile: String, content: String): String {
        require(!apiKey.isNullOrBlank()) { "gemini.apiKey is required for generateClusterCheck()" }
        // Ask Gemini to generate a SINGLE kubectl command that prints JSON for the target resource(s).
        val parts = mutableListOf<JsonObject>()
        parts += JsonObject(mapOf("text" to JsonPrimitive(
            "Output exactly ONE kubectl command (no backticks, no prose) that, when executed, prints JSON describing the Kubernetes resource(s) defined by the provided YAML/spec. " +
                "Prefer 'kubectl get <kind> <name> -n <namespace> -o json'. If the exact name/kind isn't obvious, use a robust label selector such as 'app.kubernetes.io/name' or 'app' with '--selector' and include '-n <namespace>' if known. " +
                "If the spec defines a Service and a Deployment, target the primary workload (Deployment/StatefulSet) first; otherwise target the most representative resource from the spec. " +
                "The command MUST output JSON (use '-o json'). Do not include shell comments or multiple commands. " +
                "Spec context follows:\n${content}"
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
        val cmd = resp.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text?.trim()
        require(!cmd.isNullOrBlank()) { "Gemini returned empty cluster check command" }
        return cmd
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

    private fun sanitizePathSuggestion(rawInput: String, existingFiles: List<String>): String {
        // Take first non-empty line and strip code fences/quotes
        var s = rawInput
            .lineSequence()
            .firstOrNull { it.isNotBlank() }?.trim() ?: rawInput.trim()
        s = s.removePrefix("`").removeSuffix("`")
        s = s.removePrefix("```").removeSuffix("```")
        s = s.trim().trim('"', '\'', '`')

        // Normalize slashes and lowercase
        s = s.replace('\\', '/').lowercase()

        // If the model returned anything like: path: k8s/foo.yaml or in backticks, try to extract
        val regexPath = Regex("k8s/[^\n`'\"]+")
        val found = regexPath.find(s)?.value
        if (found != null) s = found

        // Ensure it starts with k8s/
        s = if (s.startsWith("k8s/")) s else "k8s/" + s.removePrefix("./").removePrefix("/")

        // Split into segments and sanitize each
        val parts = s.split('/').toMutableList()
        // Guarantee first segment is k8s
        if (parts.firstOrNull() != "k8s") parts.add(0, "k8s")

        // Join the rest back after sanitization
        val sanitized = buildList {
            add("k8s")
            val inner = parts.drop(1)
            // limit to at most 3 segments (including filename)
            val limited = if (inner.size > 3) inner.take(2) + inner.last() else inner
            // sanitize directory segments
            for (seg in limited.dropLast(1)) {
                var d = seg
                d = d.replace("_", "-")
                d = d.replace(Regex("[^a-z0-9-]"), "-")
                d = d.replace(Regex("-+"), "-").trim('-')
                if (d.isBlank()) continue
                add(d)
            }
            // sanitize filename
            var file = limited.lastOrNull() ?: "spec.yaml"
            file = file.replace("_", "-")
            file = file.replace(Regex("[^a-z0-9-.]"), "-")
            file = file.replace(Regex("-+"), "-")
            file = file.trim('-')

            // ensure extension .yaml
            file = when {
                file.endsWith(".yaml") -> file
                file.endsWith(".yml") -> file.removeSuffix(".yml") + ".yaml"
                file.contains('.') -> file.substringBeforeLast('.') + ".yaml"
                else -> "$file.yaml"
            }

            // limit base name length to 30
            val base = file.substringBeforeLast('.')
            val ext = ".yaml"
            val trimmedBase = if (base.length > 30) base.take(30).trim('-') else base
            file = trimmedBase.ifBlank { "spec" } + ext

            add(file)
        }.joinToString("/")

        // Try to reuse an existing file if similar
        val normalizedSanitized = normalizedPath(sanitized)
        val existingNormalizedToOriginal = existingFiles
            .filter { it.startsWith("k8s/") }
            .associateBy({ normalizedPath(it) }, { it })

        // Exact match by normalized form
        existingNormalizedToOriginal[normalizedSanitized]?.let { return it }

        // Try by base file name equality or containment
        val targetBase = sanitized.substringAfterLast('/')
            .substringBeforeLast('.')
        existingFiles.filter { it.startsWith("k8s/") }.forEach { ex ->
            val exBase = ex.substringAfterLast('/').substringBeforeLast('.')
            if (exBase == targetBase || exBase.contains(targetBase) || targetBase.contains(exBase)) {
                return ex
            }
        }

        return sanitized
    }

    private fun normalizedPath(p: String): String {
        return p.lowercase()
            .replace('\\', '/')
            .removePrefix("./")
            .removePrefix("/")
            .let { if (it.startsWith("k8s/")) it else "k8s/$it" }
            .replace(Regex("_"), "-")
            .replace(Regex("[^a-z0-9-/.]"), "-")
            .replace(Regex("-+"), "-")
            .replace(".yml", ".yaml")
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
