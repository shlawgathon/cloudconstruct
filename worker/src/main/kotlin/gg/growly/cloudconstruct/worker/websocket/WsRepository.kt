package gg.growly.cloudconstruct.worker.websocket

import com.mongodb.client.MongoCollection
import com.mongodb.client.MongoDatabase
import com.mongodb.client.model.ReplaceOptions
import org.bson.Document
import java.util.Date

class WsRepository(private val db: MongoDatabase) {
    private val wsStates get() = db.getCollection("ws_states")
    private val whiteboardStates: MongoCollection<Document> get() = db.getCollection("whiteboard_states")

    fun saveWebSocketState(connectionId: String, state: Document) {
        wsStates.replaceOne(
            Document("connectionId", connectionId),
            state.append("connectionId", connectionId).append("updatedAt", Date()),
            ReplaceOptions().upsert(true)
        )
    }

    fun getWebSocketState(connectionId: String): Document? {
        return wsStates.find(Document("connectionId", connectionId)).first()
    }

    fun saveWhiteboardState(projectId: String, state: Document) {
        whiteboardStates.replaceOne(
            Document("projectId", projectId),
            state.append("projectId", projectId).append("updatedAt", Date()),
            ReplaceOptions().upsert(true)
        )
    }

    fun getWhiteboardState(projectId: String): Document? {
        return whiteboardStates.find(Document("projectId", projectId)).first()
    }

    fun listWhiteboardStates(): List<Document> {
        return whiteboardStates.find().toList()
    }
}
