package gg.growly.cloudconstruct.worker

import configureWebSockets
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.response.*

fun main(args: Array<String>)
{
    EngineMain.main(args)
}

fun Application.module()
{
    install(ContentNegotiation) { json() }
    install(CORS) {
        // Methods used by the frontend (preflight + actual requests)
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Patch)
        // Headers used by fetch() including JSON bodies and auth
        allowHeader(HttpHeaders.Authorization)
        allowHeader(HttpHeaders.ContentType)
        allowHeader("MyCustomHeader")
        // Allow cookies to be sent/received cross-origin
        allowCredentials = true
        // Frontend dev origin
        allowHost("localhost:3001", schemes = listOf("http"))
    }

    configureHTTP()
    configureSecurity()
    configureMonitoring()
    configureDatabases()
    configureWebSockets()
}
