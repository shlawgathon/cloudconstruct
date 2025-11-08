package gg.growly.cloudconstruct.cli.ws

import kotlinx.serialization.Serializable

@Serializable
sealed class WSMessage {
    @Serializable
    data class Auth(val token: String) : WSMessage()

    @Serializable
    data class FileOperation(
        val operation: String,
        val path: String? = null,
        val content: String? = null,
        val searchQuery: String? = null
    ) : WSMessage()
}
