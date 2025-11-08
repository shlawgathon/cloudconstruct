package gg.growly.cloudconstruct.worker.test.e2e

import com.mongodb.client.MongoClients
import gg.growly.cloudconstruct.worker.module
import gg.growly.cloudconstruct.worker.websocket.WSMessage
import io.ktor.client.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.cookies.*
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.testing.*
import io.ktor.websocket.*
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.bson.Document
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class WebSocketE2ETest {
    private val json = Json { ignoreUnknownKeys = true }

    private suspend fun HttpClient.registerAndLogin(username: String, password: String) {
        val reg = post("/auth/register") {
            contentType(ContentType.Application.Json)
            setBody("""{"username":"$username","password":"$password"}""")
        }
        assertEquals(HttpStatusCode.Created, reg.status)
        val login = post("/auth/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"username":"$username","password":"$password"}""")
        }
        assertEquals(HttpStatusCode.OK, login.status)
    }

    @Test
    fun `VSC websocket end-to-end`() = testApplication {
        application { module() }

        val client = createClient {
            install(HttpCookies)
            install(ContentNegotiation) { json() }
            install(WebSockets)
        }

        val username = "vsc_" + System.currentTimeMillis()
        val password = "passVSC!"
        client.registerAndLogin(username, password)

        val tokenResp = client.post("/ws/token") {
            parameter("type", "VSC")
        }
        assertEquals(HttpStatusCode.OK, tokenResp.status)
        val token = json.parseToJsonElement(tokenResp.bodyAsText()).jsonObject["sessionToken"]?.jsonPrimitive?.content
        assertNotNull(token)

        val ws = client.webSocketSession(path = "/ws/vsc")
        try {
            // Send auth frame
            ws.sendSerialized(WSMessage.Auth(token))

            // Send a file list request and expect a response with files
            ws.sendSerialized(WSMessage.FileOperation(operation = "list"))

            val responseText = withTimeout(3_000) {
                val frame = ws.incoming.receive() as Frame.Text
                frame.readText()
            }
            assertTrue(responseText.contains("files"), "Expected files list response, got: $responseText")
        } finally {
            ws.close()
        }
    }

    @Test
    fun `Excalidraw websocket end-to-end with DB whiteboard save and cross-broadcast`() = testApplication {
        application { module() }

        val client = createClient {
            install(HttpCookies)
            install(ContentNegotiation) { json() }
            install(WebSockets)
        }

        val username = "ex_" + System.currentTimeMillis()
        val password = "passEX!"
        client.registerAndLogin(username, password)

        // Create tokens for both connections
        val excTokenResp = client.post("/ws/token") { parameter("type", "EXCALIDRAW") }
        val vscTokenResp = client.post("/ws/token") { parameter("type", "VSC") }
        assertEquals(HttpStatusCode.OK, excTokenResp.status)
        assertEquals(HttpStatusCode.OK, vscTokenResp.status)
        val excToken = json.parseToJsonElement(excTokenResp.bodyAsText()).jsonObject["sessionToken"]?.jsonPrimitive?.content!!
        val vscToken = json.parseToJsonElement(vscTokenResp.bodyAsText()).jsonObject["sessionToken"]?.jsonPrimitive?.content!!

        val exc = client.webSocketSession(path = "/ws/excalidraw")
        val vsc = client.webSocketSession(path = "/ws/vsc")
        try {
            // Authenticate both
            exc.sendSerialized(WSMessage.Auth(excToken))
            vsc.sendSerialized(WSMessage.Auth(vscToken))

            // 1) Send a whiteboard update from Excalidraw; expect a broadcast to VSC
            val componentId = "comp-${System.currentTimeMillis()}"
            val update = WSMessage.WhiteboardUpdate(
                componentId = componentId,
                elements = emptyList(),
                screenshot = null
            )
            exc.sendSerialized(update)

            val broadcastToVsc = withTimeout(3_000) {
                val frame = vsc.incoming.receive() as Frame.Text
                frame.readText()
            }
            assertTrue(broadcastToVsc.contains("WhiteboardUpdate"), "Expected broadcast WhiteboardUpdate to VSC, got: $broadcastToVsc")

            // Verify DB persistence of whiteboard state
            runCatching {
                MongoClients.create("mongodb://localhost:27017/?maxPoolSize=20&w=majority").use { mongo ->
                    val coll = mongo.getDatabase("cloudconstruct-live").getCollection("whiteboard_states")
                    val found = coll.find(Document("projectId", componentId)).first()
                    assertNotNull(found, "whiteboard_states should contain entry for $componentId")
                }
            }.onFailure {
                // If Mongo is not available locally, surface a clearer message
                throw AssertionError("MongoDB must be running on localhost:27017 for E2E tests: ${it.message}")
            }

            // 2) From VSC, request a cluster check; expect a response to VSC and a status update broadcast to Excalidraw
            val req = WSMessage.ClusterCheckRequest(componentId = componentId, specFile = "spec.yml")
            vsc.sendSerialized(req)

            // First message back to VSC should be ClusterCheckResponse
            val vscMsg = withTimeout(5_000) {
                val frame = vsc.incoming.receive() as Frame.Text
                frame.readText()
            }
            assertTrue(vscMsg.contains("ClusterCheckResponse"), "Expected ClusterCheckResponse to VSC, got: $vscMsg")

            // Excalidraw should receive a StatusUpdate broadcast
            val excMsg = withTimeout(5_000) {
                val frame = exc.incoming.receive() as Frame.Text
                frame.readText()
            }
            assertTrue(excMsg.contains("StatusUpdate"), "Expected StatusUpdate broadcast to Excalidraw, got: $excMsg")
        } finally {
            exc.close(); vsc.close()
        }
    }
}

// ----------------- Helpers -----------------
private suspend inline fun DefaultClientWebSocketSession.sendSerialized(message: WSMessage) {
    val payload = Json { ignoreUnknownKeys = true }.encodeToString(WSMessage.serializer(), message)
    send(Frame.Text(payload))
}
