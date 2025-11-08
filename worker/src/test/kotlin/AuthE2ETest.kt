import io.ktor.client.*
import io.ktor.client.plugins.cookies.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
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
            install(HttpCookies)
            install(io.ktor.client.plugins.contentnegotiation.ContentNegotiation) { json() }
        }

        // Pick a unique username to avoid collisions in the real Mongo database
        val username = "user_" + java.util.UUID.randomUUID().toString().replace("-", "")
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
        assertEquals(HttpStatusCode.Created, registerResponse.status)
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
        assertEquals(HttpStatusCode.OK, loginOk.status)
        val loginOkText = loginOk.bodyAsText()
        val loginUserId = runCatching {
            json.parseToJsonElement(loginOkText).jsonObject["userId"]?.jsonPrimitive?.content
        }.getOrNull()
        assertNotNull(loginUserId, "login should return userId in body: $loginOkText")

        // 3) Access protected route /user/me with session cookie
        val meOk: HttpResponse = client.get("/user/me")
        assertEquals(HttpStatusCode.OK, meOk.status)
        val meText = meOk.bodyAsText()
        val meJson = runCatching { json.parseToJsonElement(meText).jsonObject }.getOrNull()
        assertNotNull(meJson, "/user/me should return JSON body: $meText")
        val meId = meJson!!["id"]?.jsonPrimitive?.content
        assertEquals(loginUserId, meId, "/user/me should return the logged in user's id")

        // 4) Logout and ensure access is now unauthorized
        val logoutRes: HttpResponse = client.post("/auth/logout")
        assertEquals(HttpStatusCode.OK, logoutRes.status)

        val meAfterLogout: HttpResponse = client.get("/user/me")
        assertEquals(HttpStatusCode.Unauthorized, meAfterLogout.status)
    }

    @Test
    fun `login failure returns 401`() = testApplication {
        application { module() }

        val client: HttpClient = createClient {
            install(HttpCookies)
            install(io.ktor.client.plugins.contentnegotiation.ContentNegotiation) { json() }
        }

        val username = "nouser_" + java.util.UUID.randomUUID().toString().replace("-", "")
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
        assertEquals(HttpStatusCode.Unauthorized, loginFail.status)
    }
}
