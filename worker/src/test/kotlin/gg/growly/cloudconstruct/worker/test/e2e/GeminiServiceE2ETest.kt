package gg.growly.cloudconstruct.worker.test.e2e

import gg.growly.cloudconstruct.worker.environment.Env
import gg.growly.cloudconstruct.worker.websocket.CodeGenContext
import gg.growly.cloudconstruct.worker.websocket.GeminiService
import gg.growly.cloudconstruct.worker.websocket.WhiteboardElement
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestData
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.Url
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import io.ktor.http.withCharset
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.config.MapApplicationConfig
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class GeminiServiceE2ETest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `mock path uses deterministic YAML and analysis without API key`() = runBlocking {
        val cfg = MapApplicationConfig().apply {
            // No gemini.apiKey set (or empty) should trigger mock behavior
            put("gemini.model", Env.get("GEMINI_MODEL") ?: "")
            put("gemini.apiKey", Env.get("GEMINI_API_KEY") ?: "")
        }
        val service = GeminiService(cfg)

        val context = CodeGenContext(
            whiteboard = listOf(
                WhiteboardElement(
                    id = "1",
                    type = "text",
                    x = 0.0,
                    y = 0.0,
                    text = "Hello World"
                )
            ),
            files = emptyList()
        )

        val code = service.generateCode("Create a web service", context)
        assertTrue(code.contains("kind: Deployment"), "Should contain Deployment")
        assertTrue(code.contains("kind: Service"), "Should contain Service")
        assertTrue(code.contains("name: hello-world"), "Should infer name from whiteboard text")

        val analysis = service.analyzeWhiteboard(context.whiteboard)
        println(analysis)
        assertNotEquals("No analysis", analysis)
    }

    @Test
    fun `configured path calls Gemini endpoint and returns model text`() = runBlocking {
        val model = "g-model"
        val apiKey = "dummy-key"
        val cfg = MapApplicationConfig().apply {
            put("gemini.model", model)
            put("gemini.apiKey", apiKey)
        }

        // Create a MockEngine that validates request and returns a fake GeminiResponse
        val engine = MockEngine { request ->
            validateGeminiRequest(request, model, apiKey)
            val body = """
                {
                  "candidates": [
                    { "content": { "parts": [ { "text": "OK_FROM_MODEL" } ] } }
                  ]
                }
            """.trimIndent()
            respond(
                content = body,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val client = HttpClient(engine) {
            install(ContentNegotiation) { json(json) }
        }
        val service = GeminiService(cfg, client)

        val context = CodeGenContext(whiteboard = emptyList(), files = emptyList())
        val text = service.generateCode("Prompt", context)
        assertEquals("OK_FROM_MODEL", text)

        val analysis = service.analyzeWhiteboard(emptyList(), null)
        assertEquals("OK_FROM_MODEL", analysis)
    }

    private fun validateGeminiRequest(request: HttpRequestData, model: String, apiKey: String) {
        assertEquals(HttpMethod.Post, request.method)
        val url: Url = request.url
        // Endpoint format: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
        assertTrue(url.host.contains("generativelanguage.googleapis.com"))
        assertTrue(url.encodedPath.contains("/v1beta/models/$model:generateContent"), "Path should contain model name")
        assertEquals(apiKey, url.parameters["key"], "API key must be provided via query param")
        // Ensure JSON content is sent
        val content = request.body as TextContent
        assertTrue(content.contentType?.toString()?.startsWith("application/json") == true, "Content-Type should be application/json")
        assertTrue(content.text.contains("contents"), "Request body should contain contents array")
    }
}
