package gg.growly.cloudconstruct.worker.websocket

import io.ktor.websocket.WebSocketSession
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class ConnectionManager {
    private val vscConnections = ConcurrentHashMap<String, WebSocketSession>()
    private val excalidrawConnections = ConcurrentHashMap<String, WebSocketSession>()
    private val sessionTokens = ConcurrentHashMap<String, SessionInfo>()

    data class SessionInfo(
        val userId: String,
        val expiresAt: Long,
        val connectionType: ConnectionType
    )

    enum class ConnectionType { VSC, EXCALIDRAW }

    fun addVSCConnection(token: String, session: WebSocketSession) {
        vscConnections[token] = session
    }

    fun addExcalidrawConnection(token: String, session: WebSocketSession) {
        excalidrawConnections[token] = session
    }

    fun removeVSCConnection(token: String) { vscConnections.remove(token) }
    fun removeExcalidrawConnection(token: String) { excalidrawConnections.remove(token) }

    fun getAllVSCSessions(): Map<String, WebSocketSession> = vscConnections.toMap()
    fun getAllExcalidrawSessions(): Map<String, WebSocketSession> = excalidrawConnections.toMap()

    fun createSession(userId: String, type: ConnectionType): String {
        val token = UUID.randomUUID().toString()
        val expiresAt = System.currentTimeMillis() + (24 * 60 * 60 * 1000) // 24h
        sessionTokens[token] = SessionInfo(userId, expiresAt, type)
        return token
    }

    fun validateSession(token: String): SessionInfo? {
        val session = sessionTokens[token] ?: return null
        if (session.expiresAt < System.currentTimeMillis()) {
            sessionTokens.remove(token)
            return null
        }
        return session
    }

    fun getUserConnectionCounts(userId: String): Pair<Int, Int> {
        var vsc = 0
        var exca = 0
        sessionTokens.forEach { (token, info) ->
            if (info.userId == userId) {
                when (info.connectionType) {
                    ConnectionType.VSC -> if (vscConnections.containsKey(token)) vsc++
                    ConnectionType.EXCALIDRAW -> if (excalidrawConnections.containsKey(token)) exca++
                }
            }
        }
        return Pair(vsc, exca)
    }

    fun getSessionsForUser(userId: String): List<WebSocketSession> {
        val sessions = mutableListOf<WebSocketSession>()
        sessionTokens.forEach { (token, info) ->
            if (info.userId == userId) {
                when (info.connectionType) {
                    ConnectionType.VSC -> vscConnections[token]?.let { sessions.add(it) }
                    ConnectionType.EXCALIDRAW -> excalidrawConnections[token]?.let { sessions.add(it) }
                }
            }
        }
        return sessions
    }
}
