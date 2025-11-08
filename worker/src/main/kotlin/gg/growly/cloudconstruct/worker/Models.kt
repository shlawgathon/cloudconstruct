package gg.growly.cloudconstruct.worker

import com.mongodb.client.MongoCollection
import com.mongodb.client.MongoDatabase
import com.mongodb.client.model.Filters
import com.mongodb.client.model.IndexOptions
import com.mongodb.client.model.Indexes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.bson.Document
import org.bson.types.ObjectId
import java.security.MessageDigest

// ===================== MODELS =====================

@Serializable
data class User(
    val username: String,
    val passwordHash: String
) {
    fun toDocument(): Document = Document.parse(json.encodeToString(this))

    companion object {
        private val json = Json { ignoreUnknownKeys = true }
        fun fromDocument(document: Document): User = json.decodeFromString(document.toJson())
        fun hashPassword(password: String): String {
            val md = MessageDigest.getInstance("SHA-256")
            val digest = md.digest(password.toByteArray())
            return digest.joinToString("") { "%02x".format(it) }
        }
    }
}

// ===================== SERVICES =====================

class UserService(private val database: MongoDatabase) {
    private val collection: MongoCollection<Document>

    init {
        try { database.createCollection("users") } catch (_: Exception) {}
        collection = database.getCollection("users")
        try { collection.createIndex(Indexes.ascending("username"), IndexOptions().unique(true)) } catch (_: Exception) {}
    }

    suspend fun create(username: String, password: String): String = withContext(Dispatchers.IO) {
        val user = User(
            username = username,
            passwordHash = User.hashPassword(password)
        )
        val doc = user.toDocument()
        collection.insertOne(doc)
        doc["_id"].toString()
    }

    suspend fun findByUsername(username: String): Pair<String, User>? = withContext(Dispatchers.IO) {
        val doc = collection.find(Filters.eq("username", username)).first() ?: return@withContext null
        val id = (doc["__id"] ?: doc["_id"]).toString()
        id to User.fromDocument(doc)
    }

    suspend fun getById(userId: String): Pair<String, User>? = withContext(Dispatchers.IO) {
        val doc = collection.find(Filters.eq("_id", ObjectId(userId))).first() ?: return@withContext null
        doc["_id"].toString() to User.fromDocument(doc)
    }

    suspend fun verifyCredentials(username: String, password: String): Pair<String, User>? = withContext(Dispatchers.IO) {
        val existing = findByUsername(username) ?: return@withContext null
        val (id, user) = existing
        if (user.passwordHash == User.hashPassword(password)) id to user else null
    }
}
