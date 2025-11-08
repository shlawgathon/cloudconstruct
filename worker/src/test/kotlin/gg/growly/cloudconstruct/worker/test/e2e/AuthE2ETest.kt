package gg.growly.cloudconstruct.worker.test.e2e

import gg.growly.cloudconstruct.worker.module
import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.cookies.HttpCookies
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class AuthE2ETest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `register, login, access protected, logout`() = testApplication {
        // Boot the real application module
        application { module() }

        // Use a client that keeps cookies to preserve the session across requests
        val client: HttpClient = createClient {
            HttpClientConfig.install(HttpCookies.Companion)
            install(ContentNegotiation) { json() }
        }

        // Pick a unique username to avoid collisions in the real Mongo database
        val username = "user_" + UUID.randomUUID().toString().replace("-", "")
        val password = "password123!"

        // 1) Register
        val registerResponse: HttpResponse = client.post("/auth/register") {
            contentType(ContentType.Application.Json)
            setBody(
                """
                {"username":"$username","password":"$password"}
                """.trimIndent()
            )
        }
        assertEquals(HttpStatusCode.Companion.Created, registerResponse.status)
        val registerText = registerResponse.bodyAsText()
        val regUserId = runCatching {
            json.parseToJsonElement(registerText).jsonObject["userId"]?.jsonPrimitive?.content
        }.getOrNull()
        assertNotNull(regUserId, "register should return userId in body: $registerText")

        // 2) Login (success)
        val loginOk: HttpResponse = client.post("/auth/login") {
            contentType(ContentType.Application.Json)
            setBody(
                """
                {"username":"$username","password":"$password"}
                """.trimIndent()
            )
        }
        assertEquals(HttpStatusCode.Companion.OK, loginOk.status)
        val loginOkText = loginOk.bodyAsText()
        val loginUserId = runCatching {
            json.parseToJsonElement(loginOkText).jsonObject["userId"]?.jsonPrimitive?.content
        }.getOrNull()
        assertNotNull(loginUserId, "login should return userId in body: $loginOkText")

        // 3) Access protected route /user/me with session cookie
        val meOk: HttpResponse = client.get("/user/me")
        assertEquals(HttpStatusCode.Companion.OK, meOk.status)
        val meText = meOk.bodyAsText()
        val meJson = runCatching { json.parseToJsonElement(meText).jsonObject }.getOrNull()
        assertNotNull(meJson, "/user/me should return JSON body: $meText")
        val meId = meJson!!["id"]?.jsonPrimitive?.content
        assertEquals(loginUserId, meId, "/user/me should return the logged in user's id")

        // 4) Logout and ensure access is now unauthorized
        val logoutRes: HttpResponse = client.post("/auth/logout")
        assertEquals(HttpStatusCode.Companion.OK, logoutRes.status)

        val meAfterLogout: HttpResponse = client.get("/user/me")
        assertEquals(HttpStatusCode.Companion.Unauthorized, meAfterLogout.status)
    }

    @Test
    fun `login failure returns 401`() = testApplication {
        application { module() }

        val client: HttpClient = createClient {
            HttpClientConfig.install(HttpCookies.Companion)
            install(ContentNegotiation) { json() }
        }

        val username = "nouser_" + UUID.randomUUID().toString().replace("-", "")
        val wrongPassword = "definitelyWrong!"

        // Attempt to login without registering first
        val loginFail: HttpResponse = client.post("/auth/login") {
            contentType(ContentType.Application.Json)
            setBody(
                """
                {"username":"$username","password":"$wrongPassword"}
                """.trimIndent()
            )
        }
        assertEquals(HttpStatusCode.Companion.Unauthorized, loginFail.status)
    }
}
