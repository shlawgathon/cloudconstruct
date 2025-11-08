package gg.growly.cloudconstruct.cli

import kotlinx.serialization.Serializable
import java.nio.file.Files
import java.nio.file.Path

@Serializable
data class AppConfig(
    val baseUrl: String? = null,
    val token: String? = null
)

object ConfigStore {
    var config: AppConfig = AppConfig()
        private set

    fun load() {
        val file = Path.of(AppContext.configFile.toString())
        if (Files.exists(file)) {
            val text = Files.readString(file)
            config = AppContext.json.decodeFromString(AppConfig.serializer(), text)
        }
    }

    fun save(newConfig: AppConfig) {
        config = newConfig
        val file = Path.of(AppContext.configFile.toString())
        val text = AppContext.json.encodeToString(AppConfig.serializer(), newConfig)
        Files.writeString(file, text)
    }

    fun update(partial: AppConfig.() -> AppConfig) {
        save(config.partial())
    }
}
