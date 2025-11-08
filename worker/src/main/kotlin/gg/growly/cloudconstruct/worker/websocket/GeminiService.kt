package gg.growly.cloudconstruct.worker.websocket

import gg.growly.cloudconstruct.worker.environment.Env
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.post
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.client.request.setBody
import io.ktor.server.config.ApplicationConfig
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

    suspend fun generateCode(prompt: String, context: CodeGenContext): String {
        // If no API key, return deterministic mock helpful for tests
        if (apiKey.isNullOrBlank()) {
            return mockK8sFromContext(prompt, context)
        }
        val parts = mutableListOf<JsonObject>()
        parts += JsonObject(mapOf("text" to JsonPrimitive("You are a code generator that outputs ONLY Kubernetes YAML manifests. Generate k8s specs for the described component(s).")))
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
        val text = resp.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text
        return text?.trim().takeUnless { it.isNullOrBlank() } ?: mockK8sFromContext(prompt, context)
    }

    suspend fun analyzeWhiteboard(
        elements: List<WhiteboardElement>,
        screenshot: String? = null
    ): String {
        if (apiKey.isNullOrBlank()) return "${elements.size} element(s); mock analysis"
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
        return resp.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text ?: "No analysis"
    }

    suspend fun generateClusterCheck(specFile: String): String {
        // Return JS code using @kubernetes/client-node to check/apply a spec if missing
        return """
        import { KubeConfig, KubernetesObjectApi } from '@kubernetes/client-node';
        import fs from 'fs';

        export async function ensureApplied(filePath = '$specFile') {
          const kc = new KubeConfig();
          kc.loadFromDefault();
          const k8sApi = KubernetesObjectApi.makeApiClient(kc);
          const yaml = (await import('yaml')).default;
          const text = fs.readFileSync(filePath, 'utf8');
          const docs = yaml.parseAllDocuments(text).map(d => d.toJSON());
          for (const obj of docs) {
            if (!obj) continue;
            try {
              await k8sApi.read(obj);
            } catch {
              try {
                await k8sApi.create(obj);
              } catch (e) {
                try { await k8sApi.patch(obj); } catch (e2) { console.error('apply failed', e2); }
              }
            }
          }
        }
        """.trimIndent()
    }

    private fun mockK8sFromContext(prompt: String, context: CodeGenContext): String {
        val name = inferName(context) ?: "generated-component"
        return """
        # Generated code based on prompt: $prompt
        apiVersion: apps/v1
        kind: Deployment
        metadata:
          name: $name
        spec:
          replicas: 1
          selector:
            matchLabels:
              app: $name
          template:
            metadata:
              labels:
                app: $name
            spec:
              containers:
              - name: $name
                image: nginx:latest
                ports:
                - containerPort: 80
        ---
        apiVersion: v1
        kind: Service
        metadata:
          name: $name
        spec:
          selector:
            app: $name
          ports:
            - port: 80
              targetPort: 80
        """.trimIndent()
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
