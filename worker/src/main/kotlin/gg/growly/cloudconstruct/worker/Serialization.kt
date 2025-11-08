package gg.growly.cloudconstruct.worker

import kotlinx.serialization.json.Json

/**
 * @author Subham
 * @since 11/8/25
 */
val globalJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    encodeDefaults = true
    classDiscriminator = "type"
}
