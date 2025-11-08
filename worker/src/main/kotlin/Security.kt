import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.sessions.*
import io.ktor.http.*
import kotlinx.serialization.Serializable

// Configures session-based auth to work with Mongo-backed user system.
fun Application.configureSecurity() {
    install(Sessions) {
        cookie<UserSession>("USER_SESSION") {
            cookie.extensions["SameSite"] = "lax"
        }
    }
    // Install default Authentication using sessions so `authenticate {}` blocks work
    install(Authentication) {
        session<UserSession> {
            validate { session -> session }
            challenge { call.respond(HttpStatusCode.Unauthorized) }
        }
    }
}

@Serializable
data class UserSession(val userId: String = "")
