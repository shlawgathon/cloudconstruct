package gg.growly.cloudconstruct.worker

import com.mongodb.client.MongoClients
import com.mongodb.client.MongoDatabase
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.sessions.*
import kotlinx.serialization.Serializable
import io.ktor.util.AttributeKey

private val MongoDbAttributeKey = AttributeKey<MongoDatabase>("gg.growly.cloudconstruct.worker.mongoDatabase")

fun Application.configureDatabases()
{
    val mongoDatabase = connectToMongoDB()
    // Expose database via application attributes for reuse
    attributes.put(MongoDbAttributeKey, mongoDatabase)

    val userService = UserService(mongoDatabase)

    @Serializable
    data class RegisterRequest(val username: String, val password: String, val profilePictureBase64: String? = null)
    @Serializable
    data class LoginRequest(val username: String, val password: String)
    @Serializable
    data class UserItem(val id: String, val user: User)

    routing {
        // ========== Auth ==========
        post("/auth/register") {
            val body = call.receive<RegisterRequest>()
            try
            {
                val id = userService.create(body.username, body.password)
                call.respond(HttpStatusCode.Created, mapOf("userId" to id))
            } catch (e: Exception)
            {
                call.respond(HttpStatusCode.Conflict, mapOf("error" to (e.message ?: "conflict")))
            }
        }
        post("/auth/login") {
            val body = call.receive<LoginRequest>()
            val verified = userService.verifyCredentials(body.username, body.password)
            if (verified != null)
            {
                val (id, _) = verified
                call.sessions.set(UserSession(id))
                println("[AUTH][LOGIN] user='${body.username}' -> SUCCESS, userId=$id")
                call.respond(mapOf("userId" to id))
            } else
            {
                println("[AUTH][LOGIN] user='${body.username}' -> FAILURE")
                call.respond(HttpStatusCode.Unauthorized)
            }
        }
        post("/auth/logout") {
            call.sessions.clear<UserSession>()
            call.respond(HttpStatusCode.OK)
        }

        authenticate {
            // ========== gg.growly.cloudconstruct.worker.User Profile ==========
            get("/user/me") {
                val session = call.sessions.get(UserSession::class) as? UserSession
                val userId = session?.userId ?: return@get call.respond(HttpStatusCode.Unauthorized)
                val pair = userService.getById(userId) ?: return@get call.respond(HttpStatusCode.NotFound)
                call.respond(UserItem(id = pair.first, user = pair.second))
            }
        }
    }
}

fun Application.mongoDatabase(): MongoDatabase = attributes[MongoDbAttributeKey]

fun Application.connectToMongoDB(): MongoDatabase
{
    val uri = "mongodb://localhost:27017/?maxPoolSize=20&w=majority"
    val mongoClient = MongoClients.create(uri)
    val database = mongoClient.getDatabase("cloudconstruct-live")

    monitor.subscribe(ApplicationStopped) {
        mongoClient.close()
    }

    return database
}
