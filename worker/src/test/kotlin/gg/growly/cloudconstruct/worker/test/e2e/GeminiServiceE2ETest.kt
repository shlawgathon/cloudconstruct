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
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.config.MapApplicationConfig
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GeminiServiceE2ETest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `calls all GeminiService functions via model and prints outputs`() = runBlocking {
        val cfg = MapApplicationConfig().apply {
            // No gemini.apiKey set (or empty) should trigger mock behavior
            put("gemini.model", Env.get("GEMINI_MODEL") ?: "")
            put("gemini.apiKey", Env.get("GEMINI_API_KEY") ?: "")
        }

        val service = GeminiService(cfg)

        val context = CodeGenContext(
            whiteboard = listOf(
                WhiteboardElement(id = "1", type = "text", x = 0.0, y = 0.0, text = "Hello World")
            ),
            files = emptyList()
        )

        // generateCode
        val yaml = service.generateCode("Create a web service", context)
        println("generateCode ->\n$yaml")
//        assertEquals("OK_FROM_MODEL", yaml)

        // analyzeWhiteboard
        val analysis = service.analyzeWhiteboard(context.whiteboard)
        println("analyzeWhiteboard ->\n$analysis")
//        assertEquals("OK_FROM_MODEL", analysis)

        // suggestSpecPath
        val suggestedPath = service.suggestSpecPath(context, yaml = "apiVersion: v1\nkind: Service\nmetadata:\n  name: hello-world", existingFiles = listOf("k8s/hello-world.yaml"))
        println("suggestSpecPath -> $suggestedPath")
//        assertEquals("OK_FROM_MODEL", suggestedPath)

        // generateClusterCheck
        val jsModule = service.generateClusterCheck("k8s/hello-world.yaml")
        println("generateClusterCheck ->\n$jsModule")
//        assertEquals("OK_FROM_MODEL", jsModule)

        // generateStatusComponent
        val statusJson = "{" + "\"ready\": true, \"details\": []" + "}"
        val excalidraw = service.generateStatusComponent(statusJson, context)
        println("generateStatusComponent ->\n$excalidraw")
//        assertEquals("OK_FROM_MODEL", excalidraw)
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
