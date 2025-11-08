package gg.growly.cloudconstruct.cli.ws

import gg.growly.cloudconstruct.cli.AppContext
import io.ktor.client.HttpClient
import io.ktor.client.engine.java.*
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.websocket.*
import io.ktor.serialization.kotlinx.json.json
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class WSClient {
    private val client = HttpClient(Java) {
        install(WebSockets)
        install(ContentNegotiation) { json(AppContext.json) }
    }

    suspend fun withConnection(token: String, block: suspend DefaultClientWebSocketSession.() -> Unit) {
        val url = AppContext.vscWebSocketUrl()
        client.webSocket(urlString = url) {
            // Send auth first
            val authJson = AppContext.json.encodeToString(WSMessage.Auth.serializer(), WSMessage.Auth(token))
            send(Frame.Text(authJson))
            block()
            close()
        }
    }

    suspend fun requestRawOnce(token: String, message: WSMessage): String {
        var reply: String = ""
        withConnection(token) {
            val text = AppContext.json.encodeToString(WSMessage.serializer(), message)
            send(Frame.Text(text))
            // Wait for single text reply
            for (frame in incoming) {
                if (frame is Frame.Text) {
                    reply = frame.readText()
                    break
                }
            }
        }
        return reply
    }

    suspend fun fileList(token: String, path: String?): String =
        requestRawOnce(token, WSMessage.FileOperation("list", path = path))

    suspend fun fileRead(token: String, path: String): String =
        requestRawOnce(token, WSMessage.FileOperation("read", path = path))

    suspend fun fileCreate(token: String, path: String, content: String): String =
        requestRawOnce(token, WSMessage.FileOperation("create", path = path, content = content))

    suspend fun fileUpdate(token: String, path: String, content: String): String =
        requestRawOnce(token, WSMessage.FileOperation("update", path = path, content = content))

    suspend fun fileDelete(token: String, path: String): String =
        requestRawOnce(token, WSMessage.FileOperation("delete", path = path))

    suspend fun fileSearch(token: String, query: String): String =
        requestRawOnce(token, WSMessage.FileOperation("search", searchQuery = query))
}
