package gg.growly.cloudconstruct.cli

import com.github.ajalt.mordant.terminal.Terminal
import kotlinx.serialization.json.Json
import okio.FileSystem
import okio.Path
import okio.Path.Companion.toPath
import kotlin.io.path.createDirectories
import kotlin.io.path.exists

object AppContext {
    lateinit var t: Terminal
        private set

    lateinit var json: Json
        private set

    lateinit var configDir: Path
        private set

    lateinit var configFile: Path
        private set

    lateinit var fs: FileSystem
        private set

    var verbose: Boolean = false
        private set

    private var urlOverride: String? = null

    fun init(urlOverride: String?, verbose: Boolean) {
        this.verbose = verbose
        this.urlOverride = urlOverride
        this.t = Terminal()
        this.json = Json { ignoreUnknownKeys = true; isLenient = true }
        this.fs = FileSystem.SYSTEM
        val home = System.getProperty("user.home").toPath()
        this.configDir = (home / ".cloudconstruct").also {
            val nio = java.nio.file.Path.of(it.toString())
            if (!nio.exists()) nio.createDirectories()
        }
        this.configFile = configDir / "config.json"
        // Load existing config or create default
        ConfigStore.load()
    }

    fun baseHttpUrl(): String {
        val cfgValue = ConfigStore.config.baseUrl
        return (urlOverride ?: cfgValue ?: "http://localhost:8080").removeSuffix("/")
    }

    fun vscWebSocketUrl(): String {
        val http = baseHttpUrl()
        val wsScheme = if (http.startsWith("https://")) "wss://" else "ws://"
        val hostAndPath = http.removePrefix("http://").removePrefix("https://")
        return wsScheme + hostAndPath + "/ws/vsc"
    }
}
