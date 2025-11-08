package gg.growly.cloudconstruct.worker.environment

import kotlinx.io.files.FileNotFoundException
import java.io.File
import java.util.Properties
import kotlin.io.inputStream
import kotlin.io.use

object Env
{
    private val props = Properties()

    init
    {
        load()
    }

    private fun load()
    {
        try
        {
            File(".env").inputStream().use { stream ->
                props.load(stream)
            }
        } catch (e: FileNotFoundException)
        {
            println("Warning: .env not found. Using system environment variables only.")
        }
    }

    fun get(key: String, default: String? = null): String?
    {
        return props.getProperty(key)
            ?: System.getenv(key)
            ?: System.getProperty(key)
            ?: default
    }

    fun getRequired(key: String): String
    {
        return get(key) ?: throw kotlin.IllegalStateException("Required environment variable '$key' not found")
    }
}
