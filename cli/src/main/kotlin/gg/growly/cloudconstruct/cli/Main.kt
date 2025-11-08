package gg.growly.cloudconstruct.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.subcommands
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import gg.growly.cloudconstruct.cli.commands.FilesCommand
import gg.growly.cloudconstruct.cli.commands.LoginCommand

class CloudConstructCLI : CliktCommand(name = "cloudconstruct", help = "CloudConstruct CLI — talk to the worker like VSCode extension") {
    private val url: String by option("--url", help = "Worker base HTTP URL, e.g., http://localhost:8080").default("http://localhost:8080")
    private val verbose: Boolean by option("-v", "--verbose", help = "Verbose output").flag(default = false)

    override fun run() {
        // Initialize global config
        AppContext.init(urlOverride = url, verbose = verbose)
    }
}

fun main(args: Array<String>) {
    CloudConstructCLI()
        .subcommands(
            LoginCommand(),
            FilesCommand()
        )
        .main(args)
}
