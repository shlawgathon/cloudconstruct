import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.websocket.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.serialization.*
import kotlinx.serialization.json.*
import org.yaml.snakeyaml.Yaml
import java.io.File
import java.nio.file.*
import java.util.Base64
import kotlin.concurrent.thread
import kotlin.io.path.*

// Data classes matching the TypeScript definitions
@Serializable
sealed class WSMessage

@Serializable
@SerialName("auth")
data class AuthMessage(
    val token: String
) : WSMessage()

@Serializable
@SerialName("fileOperation")
data class FileOperationMessage(
    val operation: String, // list, read, create, update, delete, search
    val path: String? = null,
    val content: String? = null,
    val searchQuery: String? = null
) : WSMessage()

@Serializable
@SerialName("fileListRequest")
data class FileListRequestMessage(
    val requestId: String? = null
) : WSMessage()

@Serializable
@SerialName("fileListResponse")
data class FileListResponseMessage(
    val requestId: String? = null,
    val files: List<String>
) : WSMessage()

@Serializable
@SerialName("fileWriteRequest")
 data class FileWriteRequestMessage(
     val path: String,
     val content: String,
     val overwrite: Boolean = true,
     val componentId: String? = null
 ) : WSMessage()

@Serializable
@SerialName("fileWriteResponse")
 data class FileWriteResponseMessage(
     val path: String,
     val success: Boolean,
     val error: String? = null,
     val componentId: String? = null
 ) : WSMessage()

@Serializable
@SerialName("specPathSuggestion")
data class SpecPathSuggestionMessage(
    val componentId: String,
    val suggestedPath: String,
    val reason: String? = null
) : WSMessage()

@Serializable
@SerialName("statusUpdate")
data class StatusUpdateMessage(
    val componentId: String,
    val status: String,
    val message: String? = null
) : WSMessage()

@Serializable
@SerialName("clusterCheckRequest")
data class ClusterCheckRequestMessage(
    val componentId: String,
    val specFile: String,
    val k8sCode: String? = null
) : WSMessage()

@Serializable
@SerialName("clusterCheckResponse")
data class ClusterCheckResponseMessage(
    val componentId: String,
    val status: String,
    val k8sCode: String? = null,
    val errors: List<String>? = null
) : WSMessage()

@Serializable
@SerialName("clusterApplyRequest")
data class ClusterApplyRequestMessage(
    val componentId: String,
    val specFile: String,
    val k8sCode: String? = null
) : WSMessage()

@Serializable
@SerialName("clusterApplyResponse")
data class ClusterApplyResponseMessage(
    val componentId: String,
    val specFile: String,
    val success: Boolean,
    val error: String? = null
) : WSMessage()

@Serializable
@SerialName("clusterStatusPollRequest")
data class ClusterStatusPollRequestMessage(
    val componentId: String,
    val specFile: String
) : WSMessage()

@Serializable
@SerialName("clusterStatusPollResponse")
data class ClusterStatusPollResponseMessage(
    val componentId: String,
    val specFile: String,
    val statusJson: String,
    val terminal: Boolean? = null,
    val success: Boolean? = null,
    val error: String? = null
) : WSMessage()

// Authentication response
@Serializable
data class AuthResponse(
    val sessionToken: String,
    val expiresAt: Long
)

// Data class for CloudConstruct configuration
data class CloudConstruct(
    val clusters: Map<String, ClusterConfig>
)

data class ClusterConfig(
    val type: String,
    val data: Map<String, Any>
)

// VSCode CLI Tool
class VSCodeCLI(
    private val workerUrl: String,
    private val username: String,
    private val password: String,
    private val workDir: Path = Paths.get(System.getProperty("user.dir"))
) {
    private var kubeconfig: String? = null
    private val kubeconfigPath = workDir.resolve(".kube-temp-config")
    private val client = HttpClient(CIO) {
        // Keep cookies between requests (needed for session-based auth on the worker)
        install(io.ktor.client.plugins.cookies.HttpCookies)
        // WebSockets for realtime worker communication
        install(WebSockets) {
            pingInterval = 20_000
        }
    }

    private var sessionToken: String? = null
    private var wsSession: DefaultWebSocketSession? = null
    private val messageChannel = Channel<WSMessage>(Channel.UNLIMITED)
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        classDiscriminator = "type"
    }

    private var isRunning = true
    private val reconnectDelay = 5000L // 5 seconds
    private var reconnectAttempts = 0
    private val maxReconnectAttempts = 10

    // Load CloudConstruct configuration on startup
    private fun loadCloudConstruct() {
        try {
            val cloudConstructFile = workDir.resolve("cloudconstruct.yaml")
            if (!Files.exists(cloudConstructFile)) {
                println("[CONFIG] cloudconstruct.yaml not found, cluster operations will use system kubeconfig")
                return
            }

            val yaml = Yaml()
            val content = Files.readString(cloudConstructFile)
            val config = yaml.load<Map<String, Any>>(content)

            // Extract kubeconfig from main cluster
            val clusters = config["clusters"] as? Map<String, Any>
            val mainCluster = clusters?.get("main") as? Map<String, Any>
            val clusterData = mainCluster?.get("data") as? Map<String, Any>

            if (clusterData != null) {
                // Convert the data map to YAML string for kubeconfig
                kubeconfig = yaml.dump(clusterData)

                // Write kubeconfig to temp file for kubectl to use
                Files.writeString(kubeconfigPath, kubeconfig)
                kubeconfigPath.toFile().deleteOnExit()

                println("[CONFIG] Loaded kubeconfig from cloudconstruct.yaml")
                println("[CONFIG] Cluster server: ${extractServerUrl(clusterData)}")
            } else {
                println("[CONFIG] No valid kubeconfig found in cloudconstruct.yaml")
            }
        } catch (e: Exception) {
            println("[CONFIG] Error loading cloudconstruct.yaml: ${e.message}")
            e.printStackTrace()
        }
    }

    private fun extractServerUrl(kubeconfig: Map<String, Any>): String? {
        try {
            val clusters = kubeconfig["clusters"] as? List<Map<String, Any>>
            val firstCluster = clusters?.firstOrNull()
            val clusterData = firstCluster?.get("cluster") as? Map<String, Any>
            return clusterData?.get("server") as? String
        } catch (e: Exception) {
            return null
        }
    }

    // Authenticate with the worker
    private suspend fun authenticate(): String {
        val httpBase = workerUrl.replace("ws://", "http://").replace("wss://", "https://")
        val loginUrl = "$httpBase/auth/login"
        val tokenUrl = "$httpBase/ws/token?type=VSC"

        // Step 1: Login with JSON body (sets USER_SESSION cookie)
        println("[AUTH] Logging in as '$username' at $loginUrl")
        val loginResponse = client.post(loginUrl) {
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    put("username", username)
                    put("password", password)
                }.toString()
            )
        }
        if (!loginResponse.status.isSuccess()) {
            val body = try { loginResponse.bodyAsText() } catch (_: Exception) { "" }
            throw Exception("Login failed: ${loginResponse.status}. $body")
        }
        println("[AUTH] Login successful; session cookie captured")

        // Step 2: Request short-lived WS session token
        val tokenResponse = client.post(tokenUrl)
        if (!tokenResponse.status.isSuccess()) {
            val body = try { tokenResponse.bodyAsText() } catch (_: Exception) { "" }
            throw Exception("Token request failed: ${tokenResponse.status}. $body")
        }
        val authResponse = try {
            kotlinx.serialization.json.Json { ignoreUnknownKeys = true }.decodeFromString<AuthResponse>(tokenResponse.bodyAsText())
        } catch (e: Exception) {
            println("[AUTH] Failed to parse token response: ${e.message}\nBody: ${tokenResponse.bodyAsText().take(200)}")
            throw e
        }
        sessionToken = authResponse.sessionToken
        println("[AUTH] Received WS session token: ${authResponse.sessionToken.take(6)}… (exp=${authResponse.expiresAt})")
        return authResponse.sessionToken
    }

    // Connect to WebSocket
    private suspend fun connectWebSocket() {
        val token = sessionToken ?: authenticate()
        val wsEndpoint = "$workerUrl/ws/vsc"

        println("[WS] Connecting to $wsEndpoint")

        wsSession = client.webSocketSession(wsEndpoint)

        wsSession?.let { session ->
            println("[WS] Connected, sending auth message")
            // Send auth message
            val authMsg = AuthMessage(token = token)
            session.send(Frame.Text(json.encodeToString(WSMessage.serializer(), authMsg)))

            // Start receiving messages
            thread {
                runBlocking {
                    try {
                        for (frame in session.incoming) {
                            runCatching {
                                when (frame) {
                                    is Frame.Text -> {
                                        val text = frame.readText()
                                        handleIncomingMessage(text)
                                    }
                                    is Frame.Close -> {
                                        println("[WS] Connection closed by server")
                                        return@runBlocking
                                    }
                                    else -> {}
                                }
                            }.onFailure {
                                it.printStackTrace()
                            }
                        }
                    } catch (e: Exception) {
                        println("[WS] Error receiving messages: ${e.message}")
                    }
                }
            }

            reconnectAttempts = 0
            println("[WS] WebSocket connected and authenticated")
        }
    }

    // Handle incoming messages from the worker
    private suspend fun handleIncomingMessage(messageText: String) {
        try {
            println("[MSG] Received: ${messageText.take(100)}...")

            val jsonElement = json.parseToJsonElement(messageText)
            val type = jsonElement.jsonObject["type"]?.jsonPrimitive?.content

            when (type) {
                "fileOperation" -> {
                    val msg = json.decodeFromJsonElement<FileOperationMessage>(jsonElement)
                    handleFileOperation(msg)
                }
                "fileListRequest" -> {
                    val msg = json.decodeFromJsonElement<FileListRequestMessage>(jsonElement)
                    handleFileListRequest(msg)
                }
                "fileWriteRequest" -> {
                    val msg = json.decodeFromJsonElement<FileWriteRequestMessage>(jsonElement)
                    handleFileWriteRequest(msg)
                }
                "clusterCheckRequest" -> {
                    val msg = json.decodeFromJsonElement<ClusterCheckRequestMessage>(jsonElement)
                    handleClusterCheckRequest(msg)
                }
                "clusterApplyRequest" -> {
                    val msg = json.decodeFromJsonElement<ClusterApplyRequestMessage>(jsonElement)
                    handleClusterApplyRequest(msg)
                }
                "clusterStatusPollRequest" -> {
                    val msg = json.decodeFromJsonElement<ClusterStatusPollRequestMessage>(jsonElement)
                    handleClusterStatusPollRequest(msg)
                }
                else -> {
                    println("[MSG] Unhandled message type: $type")
                }
            }
        } catch (e: Exception) {
            println("[ERROR] Failed to parse message: ${e.message}")
            e.printStackTrace()
        }
    }

    // File operation handlers
    private suspend fun handleFileOperation(msg: FileOperationMessage) {
        println("[FILE_OP] Operation: ${msg.operation}, Path: ${msg.path}")

        when (msg.operation) {
            "list" -> {
                val files = listFiles(msg.path)
                // Send response back through WebSocket if needed
                sendMessage(FileListResponseMessage(files = files))
            }
            "read" -> {
                msg.path?.let { path ->
                    val content = readFile(path)
                    // Could send content back if needed
                    println("[FILE_OP] Read ${content.length} bytes from $path")
                }
            }
            "create" -> {
                msg.path?.let { path ->
                    msg.content?.let { content ->
                        createFile(path, content)
                    }
                }
            }
            "update" -> {
                msg.path?.let { path ->
                    msg.content?.let { content ->
                        updateFile(path, content)
                    }
                }
            }
            "delete" -> {
                msg.path?.let { path ->
                    deleteFile(path)
                }
            }
            "search" -> {
                msg.searchQuery?.let { query ->
                    val results = searchFiles(query)
                    sendMessage(FileListResponseMessage(files = results))
                }
            }
        }
    }

    private suspend fun handleFileListRequest(msg: FileListRequestMessage) {
        println("[FILE_LIST] Request ID: ${msg.requestId}")
        val files = listFiles(null)
        sendMessage(FileListResponseMessage(
            requestId = msg.requestId,
            files = files
        ))
    }

    private suspend fun handleFileWriteRequest(msg: FileWriteRequestMessage) {
        println("[FILE_WRITE] Path: ${msg.path}, Overwrite: ${msg.overwrite}")
        val filePath = workDir.resolve(msg.path)

        try {
            if (!msg.overwrite && Files.exists(filePath)) {
                println("[FILE_WRITE] File exists and overwrite=false, skipping")
                // Consider this a success since the desired file is present.
                sendMessage(FileWriteResponseMessage(path = msg.path, success = true, componentId = msg.componentId))
                return
            }

            Files.createDirectories(filePath.parent)
            Files.writeString(filePath, msg.content.removePrefix("```yaml").removeSuffix("```"))
            println("[FILE_WRITE] Wrote file: $filePath")
            sendMessage(FileWriteResponseMessage(path = msg.path, success = true, componentId = msg.componentId))
        } catch (e: Exception) {
            println("[FILE_WRITE][ERR] ${e.message}")
            sendMessage(FileWriteResponseMessage(path = msg.path, success = false, error = e.message, componentId = msg.componentId))
        }
    }

    private suspend fun handleClusterCheckRequest(msg: ClusterCheckRequestMessage) {
        println("[CLUSTER_CHECK] Component: ${msg.componentId}, Spec: ${msg.specFile}")

        // Check if spec file exists
        val specPath = workDir.resolve(msg.specFile)
        if (!Files.exists(specPath)) {
            sendMessage(ClusterCheckResponseMessage(
                componentId = msg.componentId,
                status = "error",
                errors = listOf("Spec file not found: ${msg.specFile}")
            ))
            return
        }

        try {
            // If k8sCode is provided by the worker/LLM, execute it directly
            val k8sCode = msg.k8sCode
            if (!k8sCode.isNullOrEmpty()) {
                println("[CLUSTER_CHECK] Executing provided K8s code")
                val result = executeK8sCode(k8sCode, msg.componentId)

                sendMessage(ClusterCheckResponseMessage(
                    componentId = msg.componentId,
                    status = result.status,
                    k8sCode = k8sCode,
                    errors = result.errors
                ))
            } else {
                // No code provided, just check if file exists and send ready status
                sendMessage(ClusterCheckResponseMessage(
                    componentId = msg.componentId,
                    status = "ready",
                    k8sCode = null,
                    errors = null
                ))
            }
        } catch (e: Exception) {
            sendMessage(ClusterCheckResponseMessage(
                componentId = msg.componentId,
                status = "error",
                errors = listOf("Failed to check cluster: ${e.message}")
            ))
        }
    }

    private suspend fun handleClusterApplyRequest(msg: ClusterApplyRequestMessage) {
        println("[CLUSTER_APPLY] Component: ${msg.componentId}, Spec: ${msg.specFile}")

        try {
            val specPath = workDir.resolve(msg.specFile)
            if (!Files.exists(specPath)) {
                sendMessage(ClusterApplyResponseMessage(
                    componentId = msg.componentId,
                    specFile = msg.specFile,
                    success = false,
                    error = "Spec file not found: ${msg.specFile}"
                ))
                return
            }

            // If k8sCode is provided, execute it
            if (!msg.k8sCode.isNullOrEmpty()) {
                println("[CLUSTER_APPLY] Executing provided K8s code for apply")
                val result = executeK8sCode(msg.k8sCode, msg.componentId)

                sendMessage(ClusterApplyResponseMessage(
                    componentId = msg.componentId,
                    specFile = msg.specFile,
                    success = result.status == "success",
                    error = result.errors?.firstOrNull()
                ))
            } else {
                // No code provided, use kubectl apply directly
                val result = applySpecToCluster(msg.specFile)

                sendMessage(ClusterApplyResponseMessage(
                    componentId = msg.componentId,
                    specFile = msg.specFile,
                    success = result.success,
                    error = result.error
                ))

                if (result.success) {
                    println("[CLUSTER_APPLY] Successfully applied ${msg.specFile}")
                    println("[CLUSTER_APPLY] Output: ${result.output}")
                } else {
                    println("[CLUSTER_APPLY] Failed to apply ${msg.specFile}: ${result.error}")
                }
            }
        } catch (e: Exception) {
            sendMessage(ClusterApplyResponseMessage(
                componentId = msg.componentId,
                specFile = msg.specFile,
                success = false,
                error = e.message
            ))
        }
    }

    private suspend fun handleClusterStatusPollRequest(msg: ClusterStatusPollRequestMessage) {
        println("[CLUSTER_STATUS] Component: ${msg.componentId}, Spec: ${msg.specFile}")

        try {
            // Parse spec file to get resource details
            val specPath = workDir.resolve(msg.specFile)
            if (!Files.exists(specPath)) {
                sendMessage(ClusterStatusPollResponseMessage(
                    componentId = msg.componentId,
                    specFile = msg.specFile,
                    statusJson = "{}",
                    terminal = true,
                    success = false,
                    error = "Spec file not found"
                ))
                return
            }

            val specContent = Files.readString(specPath)
            val yaml = Yaml()
            val specData = yaml.load<Map<String, Any>>(specContent)
            val kind = specData["kind"] as? String ?: "unknown"
            val metadata = specData["metadata"] as? Map<String, Any>
            val name = metadata?.get("name") as? String ?: "unknown"
            val namespace = metadata?.get("namespace") as? String ?: "default"

            // Get detailed status for the resource
            val status = getDetailedClusterStatus(kind, name, namespace)

            sendMessage(ClusterStatusPollResponseMessage(
                componentId = msg.componentId,
                specFile = msg.specFile,
                statusJson = status.json,
                terminal = status.isTerminal,
                success = status.isSuccessful,
                error = status.error
            ))
        } catch (e: Exception) {
            sendMessage(ClusterStatusPollResponseMessage(
                componentId = msg.componentId,
                specFile = msg.specFile,
                statusJson = "{}",
                terminal = true,
                success = false,
                error = e.message
            ))
        }
    }

    // File system operations
    private fun listFiles(path: String?): List<String> {
        val targetPath = if (path != null) {
            workDir.resolve(path)
        } else {
            workDir
        }

        return Files.walk(targetPath, 3) // Max depth 3
            .filter { Files.isRegularFile(it) }
            .map { workDir.relativize(it).toString() }
            .toList()
    }

    private fun readFile(path: String): String {
        val filePath = workDir.resolve(path)
        return Files.readString(filePath)
    }

    private fun createFile(path: String, content: String) {
        val filePath = workDir.resolve(path)
        Files.createDirectories(filePath.parent)
        Files.writeString(filePath, content, StandardOpenOption.CREATE_NEW)
        println("[FILE] Created: $filePath")
    }

    private fun updateFile(path: String, content: String) {
        val filePath = workDir.resolve(path)
        Files.writeString(filePath, content, StandardOpenOption.TRUNCATE_EXISTING)
        println("[FILE] Updated: $filePath")
    }

    private fun deleteFile(path: String) {
        val filePath = workDir.resolve(path)
        Files.deleteIfExists(filePath)
        println("[FILE] Deleted: $filePath")
    }

    private fun searchFiles(query: String): List<String> {
        return Files.walk(workDir, 5)
            .filter { Files.isRegularFile(it) }
            .filter { path ->
                path.fileName.toString().contains(query, ignoreCase = true) ||
                    try {
                        Files.readString(path).contains(query, ignoreCase = true)
                    } catch (e: Exception) {
                        false
                    }
            }
            .map { workDir.relativize(it).toString() }
            .toList()
    }

    // Execute K8s JavaScript/TypeScript code provided by the LLM
    private data class K8sCodeResult(val status: String, val errors: List<String>? = null, val output: String? = null)

    private fun executeK8sCode(k8sCode: String, componentId: String): K8sCodeResult {
        return try {
            println("[K8S_CODE] Executing code for component: $componentId")

            // Write the code to a temporary file
            val scriptFile = workDir.resolve(".k8s-check-${componentId}.js")
            Files.writeString(scriptFile, k8sCode)
            scriptFile.toFile().deleteOnExit()

            // If we have a custom kubeconfig, inject it into the script
            val modifiedCode = if (kubeconfig != null) {
                // Replace kc.loadFromDefault() with kc.loadFromString()
                k8sCode.replace(
                    "kc.loadFromDefault()",
                    "kc.loadFromString(`${kubeconfig?.replace("`", "\\`")}`)"
                ).replace(
                    "kc.loadFromDefault();",
                    "kc.loadFromString(`${kubeconfig?.replace("`", "\\`")}`);"
                )
            } else {
                k8sCode
            }

            // Write modified code
            Files.writeString(scriptFile, modifiedCode)

            // Execute the code using Node.js
            val processBuilder = ProcessBuilder("node", scriptFile.toString())
                .directory(workDir.toFile())
                .redirectErrorStream(false)

            // Set KUBECONFIG environment variable if we have custom config
            if (kubeconfig != null) {
                processBuilder.environment()["KUBECONFIG"] = kubeconfigPath.toString()
            }

            val process = processBuilder.start()
            val output = process.inputStream.bufferedReader().readText()
            val error = process.errorStream.bufferedReader().readText()
            val exitCode = process.waitFor()

            // Clean up script file
            Files.deleteIfExists(scriptFile)

            println("[K8S_CODE] Exit code: $exitCode")
            println("[K8S_CODE] Output: ${output.take(500)}")
            if (error.isNotEmpty()) {
                println("[K8S_CODE] Error: ${error.take(500)}")
            }

            if (exitCode == 0) {
                // Try to parse output as JSON to determine status
                try {
                    val jsonOutput = json.parseToJsonElement(output).jsonObject
                    val exists = jsonOutput["exists"]?.jsonPrimitive?.booleanOrNull ?: false
                    val ready = jsonOutput["ready"]?.jsonPrimitive?.booleanOrNull ?: false

                    K8sCodeResult(
                        status = when {
                            ready -> "ready"
                            exists -> "exists"
                            else -> "not_found"
                        },
                        output = output
                    )
                } catch (e: Exception) {
                    // Output wasn't JSON, treat as success with raw output
                    K8sCodeResult(status = "success", output = output)
                }
            } else {
                K8sCodeResult(
                    status = "error",
                    errors = listOf(error.ifEmpty { "Command failed with exit code $exitCode" })
                )
            }
        } catch (e: Exception) {
            println("[K8S_CODE] Exception: ${e.message}")
            K8sCodeResult(status = "error", errors = listOf(e.message ?: "Unknown error"))
        }
    }

    // Kubernetes operations with cloudconstruct.yaml support
    private fun performClusterCheck(kind: String, name: String, namespace: String): CheckResult {
        return try {
            val processBuilder = if (kubeconfig != null) {
                ProcessBuilder(
                    "kubectl",
                    "--kubeconfig", kubeconfigPath.toString(),
                    "get", kind.toLowerCase(),
                    name,
                    "-n", namespace,
                    "-o", "json"
                )
            } else {
                ProcessBuilder(
                    "kubectl",
                    "get", kind.toLowerCase(),
                    name,
                    "-n", namespace,
                    "-o", "json"
                )
            }

            processBuilder.directory(workDir.toFile())
            val process = processBuilder.start()
            val exitCode = process.waitFor()

            if (exitCode == 0) {
                CheckResult("ready")
            } else {
                val error = process.errorStream.bufferedReader().readText()
                if (error.contains("NotFound")) {
                    CheckResult("not_found", listOf("Resource not found"))
                } else {
                    CheckResult("error", listOf(error))
                }
            }
        } catch (e: Exception) {
            CheckResult("error", listOf(e.message ?: "Unknown error"))
        }
    }

    private data class CheckResult(val status: String, val errors: List<String>? = null)

    private data class ApplyResult(val success: Boolean, val error: String?, val output: String? = null)

    private fun applySpecToCluster(specFile: String): ApplyResult {
        return try {
            val specPath = workDir.resolve(specFile)

            val processBuilder = if (kubeconfig != null) {
                ProcessBuilder(
                    "kubectl",
                    "--kubeconfig", kubeconfigPath.toString(),
                    "apply",
                    "-f", specPath.toString()
                )
            } else {
                ProcessBuilder(
                    "kubectl",
                    "apply",
                    "-f", specPath.toString()
                )
            }

            processBuilder.directory(workDir.toFile())
            processBuilder.redirectErrorStream(false)

            val process = processBuilder.start()
            val output = process.inputStream.bufferedReader().readText()
            val error = process.errorStream.bufferedReader().readText()
            val exitCode = process.waitFor()

            ApplyResult(
                success = exitCode == 0,
                error = if (exitCode != 0) error else null,
                output = if (exitCode == 0) output else null
            )
        } catch (e: Exception) {
            ApplyResult(false, e.message)
        }
    }

    // Original stub methods removed since we have proper implementations now

    private data class ClusterStatus(
        val json: String,
        val isTerminal: Boolean,
        val isSuccessful: Boolean,
        val error: String?
    )

    private fun getDetailedClusterStatus(kind: String, name: String, namespace: String): ClusterStatus {
        return try {
            val processBuilder = if (kubeconfig != null) {
                ProcessBuilder(
                    "kubectl",
                    "--kubeconfig", kubeconfigPath.toString(),
                    "get", kind.toLowerCase(),
                    name,
                    "-n", namespace,
                    "-o", "json"
                )
            } else {
                ProcessBuilder(
                    "kubectl",
                    "get", kind.toLowerCase(),
                    name,
                    "-n", namespace,
                    "-o", "json"
                )
            }

            processBuilder.directory(workDir.toFile())
            val process = processBuilder.start()
            val exitCode = process.waitFor()
            val output = process.inputStream.bufferedReader().readText()

            if (exitCode == 0) {
                // Parse JSON to check if deployment is ready
                val jsonObj = json.parseToJsonElement(output).jsonObject
                val status = jsonObj["status"]?.jsonObject

                val isReady = when (kind.toLowerCase()) {
                    "deployment", "statefulset" -> {
                        val replicas = status?.get("replicas")?.jsonPrimitive?.intOrNull ?: 0
                        val readyReplicas = status?.get("readyReplicas")?.jsonPrimitive?.intOrNull ?: 0
                        replicas > 0 && replicas == readyReplicas
                    }
                    "pod" -> {
                        val phase = status?.get("phase")?.jsonPrimitive?.contentOrNull
                        phase == "Running"
                    }
                    else -> true
                }

                ClusterStatus(
                    json = output,
                    isTerminal = isReady || (kind.toLowerCase() == "pod" &&
                        status?.get("phase")?.jsonPrimitive?.contentOrNull in listOf("Failed", "Succeeded")),
                    isSuccessful = isReady,
                    error = null
                )
            } else {
                val error = process.errorStream.bufferedReader().readText()
                ClusterStatus(
                    json = "{}",
                    isTerminal = true,
                    isSuccessful = false,
                    error = error
                )
            }
        } catch (e: Exception) {
            ClusterStatus(
                json = "{}",
                isTerminal = true,
                isSuccessful = false,
                error = e.message
            )
        }
    }

    // Original stub methods removed since we have proper implementations now

    // Send message back to worker
    private suspend fun sendMessage(message: WSMessage) {
        wsSession?.let { session ->
            val jsonStr = json.encodeToString(WSMessage.serializer(), message)
            session.send(Frame.Text(jsonStr))
            println("[SEND] Sent message : $jsonStr")
        } ?: println("[ERROR] No active WebSocket session")
    }

    // Reconnection logic
    private suspend fun reconnect() {
        while (isRunning && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++
            println("[RECONNECT] Attempt $reconnectAttempts/$maxReconnectAttempts")

            delay(reconnectDelay)

            try {
                connectWebSocket()
                return
            } catch (e: Exception) {
                println("[RECONNECT] Failed: ${e.message}")
            }
        }

        if (reconnectAttempts >= maxReconnectAttempts) {
            println("[ERROR] Max reconnection attempts reached. Exiting.")
            isRunning = false
        }
    }

    // Main run loop
    suspend fun run() {
        println("[VSCode CLI] Starting...")
        println("[VSCode CLI] Work directory: $workDir")

        // Load CloudConstruct configuration
        loadCloudConstruct()

        // Initial connection
        connectWebSocket()

        // Keep the connection alive and handle reconnections
        while (isRunning) {
            wsSession?.let { session ->
                if (!session.isActive) {
                    println("[WS] Connection lost, attempting to reconnect...")
                    reconnect()
                }
            } ?: reconnect()

            delay(1000) // Check connection status every second
        }

        cleanup()
    }

    // Cleanup resources
    private fun cleanup() {
        println("[CLEANUP] Shutting down...")

        // Clean up temporary kubeconfig file
        try {
            Files.deleteIfExists(kubeconfigPath)
        } catch (e: Exception) {
            // Ignore cleanup errors
        }

        runBlocking {
            wsSession?.close()
            client.close()
        }
    }

    // Graceful shutdown
    fun stop() {
        isRunning = false
    }
}

// Main entry point
fun main(args: Array<String>) = runBlocking {
    val workerUrl = System.getenv("WORKER_URL") ?: "ws://localhost:5353"
    val username = System.getenv("VSC_USERNAME") ?: "test"
    val password = System.getenv("VSC_PASSWORD") ?: "test"
    val workDir = System.getenv("WORK_DIR") ?: System.getProperty("user.dir")

    println("========================================")
    println("VSCode CLI Tool - Kotlin Worker Client")
    println("========================================")
    println("Worker URL: $workerUrl")
    println("Work Directory: $workDir")
    println("========================================")

    val cli = VSCodeCLI(
        workerUrl = workerUrl,
        username = username,
        password = password,
        workDir = Paths.get(workDir)
    )

    // Handle shutdown gracefully
    Runtime.getRuntime().addShutdownHook(Thread {
        println("\n[SHUTDOWN] Received shutdown signal")
        cli.stop()
    })

    try {
        cli.run()
    } catch (e: Exception) {
        println("[ERROR] Fatal error: ${e.message}")
        e.printStackTrace()
    }
}

// Dependencies for build.gradle.kts:
/*
dependencies {
    implementation("io.ktor:ktor-client-core:2.3.7")
    implementation("io.ktor:ktor-client-cio:2.3.7")
    implementation("io.ktor:ktor-client-websockets:2.3.7")
    implementation("io.ktor:ktor-client-content-negotiation:2.3.7")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")
    implementation("ch.qos.logback:logback-classic:1.4.14")
}
*/
