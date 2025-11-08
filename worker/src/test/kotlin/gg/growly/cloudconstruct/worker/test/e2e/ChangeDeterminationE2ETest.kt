package gg.growly.cloudconstruct.worker.test.e2e

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
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class ChangeDeterminationE2ETest {
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
    fun `whiteboard update triggers file write request`() = testApplication {
        application { module() }

        val client = createClient {
            install(HttpCookies)
            install(ContentNegotiation) { json() }
            install(WebSockets)
        }

        val username = "user_" + System.currentTimeMillis()
        val password = "pass!"
        client.registerAndLogin(username, password)

        val excTokenResp = client.post("/ws/token") { parameter("type", "EXCALIDRAW") }
        val vscTokenResp = client.post("/ws/token") { parameter("type", "VSC") }
        assertEquals(HttpStatusCode.OK, excTokenResp.status)
        assertEquals(HttpStatusCode.OK, vscTokenResp.status)
        val excToken = json.parseToJsonElement(excTokenResp.bodyAsText()).jsonObject["sessionToken"]?.jsonPrimitive?.content!!
        val vscToken = json.parseToJsonElement(vscTokenResp.bodyAsText()).jsonObject["sessionToken"]?.jsonPrimitive?.content!!

        val exc = client.webSocketSession(path = "/ws/excalidraw")
        val vsc = client.webSocketSession(path = "/ws/vsc")
        try {
            exc.sendSerialized(WSMessage.Auth(excToken))
            vsc.sendSerialized(WSMessage.Auth(vscToken))

            val componentId = "comp-${System.currentTimeMillis()}"
            val elements = listOf(
                gg.growly.cloudconstruct.worker.websocket.WhiteboardElement(
                    id = "1", type = "rectangle", x = 0.0, y = 0.0, width = 100.0, height = 50.0, text = "load balancer"
                )
            )
            val update = WSMessage.WhiteboardUpdate(
                componentId = componentId,
                elements = elements,
                screenshot = null
            )
            exc.sendSerialized(update)

            // Expect broadcast of WhiteboardUpdate or StatusUpdate first, then FileWriteRequest to VSC
            var sawFileWrite = false
            withTimeout(5_000) {
                while (!sawFileWrite) {
                    val frame = vsc.incoming.receive() as Frame.Text
                    val txt = frame.readText()
                    if (txt.contains("FileWriteRequest")) {
                        sawFileWrite = true
                        assertTrue(txt.contains("k8s/"))
                        assertTrue(txt.contains("apiVersion"))
                    }
                }
            }
            assertTrue(sawFileWrite, "Expected FileWriteRequest to be received by VSC")
        } finally {
            exc.close(); vsc.close()
        }
    }
}

private suspend inline fun DefaultClientWebSocketSession.sendSerialized(message: WSMessage) {
    val payload = Json { ignoreUnknownKeys = true }.encodeToString(WSMessage.serializer(), message)
    send(Frame.Text(payload))
}
