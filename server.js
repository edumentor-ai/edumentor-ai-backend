const express = require("express");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

// ==========================================
// INITIALIZE GEMINI INSTANCES
// ==========================================

const aiNotes = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY_NOTES
});

const aiQuiz = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY_QUIZ
});

// NEW: Gemini Chat Instance
const aiChat = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY_CHAT
});

const app = express();

app.use(cors());
app.use(express.json());

// ==========================================
// MULTER CONFIGURATION FOR CHAT ATTACHMENTS
// ==========================================

const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB per file
        files: 5
    },
    fileFilter: (req, file, cb) => {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "application/pdf"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only images and PDF files are supported."));
        }
    }
});

// ==========================================
// TEST ROUTE
// ==========================================

app.get("/", (req, res) => {
    res.send("EduMentor AI Backend Running");
});

// ==========================================
// AI NOTES GENERATOR
// ==========================================

app.post("/generate-notes", async (req, res) => {
    try {
        const { subject, topic, language } = req.body;

        if (!subject || !topic) {
            return res.status(400).json({
                error: "Subject and topic are required."
            });
        }

        const response = await aiNotes.models.generateContent({
            model: "gemini-3.6-flash",
            contents: `
You are an expert teacher.
Create comprehensive study notes.

Subject: ${subject}
Topic: ${topic}
Language: ${language || "English"}

Return strictly structured JSON format:
{
  "summary": "Short summary text...",
  "keyPoints": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"],
  "questions": ["Question 1", "Question 2", "Question 3", "Question 4", "Question 5"],
  "tips": "Revision tip 1...\nRevision tip 2..."
}
`,
            config: {
                responseMimeType: "application/json"
            }
        });

        const aiData = JSON.parse(response.text);

        return res.json(aiData);

    } catch (error) {
        console.error("Notes API Error:", error);

        return res.status(500).json({
            error: "Failed to generate notes."
        });
    }
});

// ==========================================
// AI QUIZ GENERATOR
// ==========================================

// Helper function to shuffle array items
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
}

// AI Quiz Generator Route
app.post("/generate-quiz", async (req, res) => {

    try {
        const {
            subject,
            topic,
            difficulty,
            questions,
            language
        } = req.body;

        const response = await aiQuiz.models.generateContent({
            model: "gemini-3.6-flash",
            contents: `
You are an expert quiz generator.
Create ${questions} multiple choice questions.

Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}
Language: ${language}

Return strictly a JSON array of objects:
[
  {
    "question": "Question text here",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "Exact text of the correct option"
  }
]
`,
            config: {
                responseMimeType: "application/json"
            }
        });

        let quiz = JSON.parse(response.text);

        // Randomly shuffle options for every question
        quiz = quiz.map(q => ({
            ...q,
            options: shuffleArray([...q.options])
        }));

        res.json({
            quiz
        });

    } catch (error) {
        console.error("Quiz API Error:", error);

        res.status(500).json({
            error: "Failed to generate quiz."
        });
    }

});

// ==========================================
// NEW: EDUMENTOR AI CHAT
// ==========================================

app.post("/chat", upload.array("attachments", 5), async (req, res) => {

    try {

        const message = req.body.message || "";
        const files = req.files || [];

        // Check whether message or attachments exist
        if (!message.trim() && files.length === 0) {
            return res.status(400).json({
                error: "Please enter a message or attach a file."
            });
        }

        // Check total attachment size
        const totalSize = files.reduce(
            (total, file) => total + file.size,
            0
        );

        if (totalSize > 15 * 1024 * 1024) {
            return res.status(400).json({
                error: "Total attachment size must not exceed 15 MB."
            });
        }

        // Prepare Gemini content parts
        const parts = [];

        // Add user's message
        if (message.trim()) {
            parts.push({
                text: message
            });
        }

        // Add uploaded images and PDFs
        for (const file of files) {

            parts.push({
                inlineData: {
                    mimeType: file.mimetype,
                    data: file.buffer.toString("base64")
                }
            });

        }

        // Generate AI response
        const response = await aiChat.models.generateContent({

            model: "gemini-3.6-flash",

            contents: [
                {
                    role: "user",
                    parts: parts
                }
            ],

            config: {
                systemInstruction: `
You are EduMentor AI, a professional academic assistant designed to help students learn, understand concepts, solve educational problems, and prepare for examinations.

Your communication style must follow these rules:

1. Always use clear, natural, professional, and student-friendly language.
2. Avoid unnecessary greetings, introductions, and promotional statements.
3. Do not repeatedly introduce yourself as EduMentor AI.
4. Never use emojis, decorative symbols, or excessive Markdown formatting.
5. Avoid unnecessary bold text, headings, and bullet points.
6. Use simple paragraphs for ordinary conversations.
7. Use headings, numbered steps, and mathematical formatting only when they genuinely improve understanding.
8. Explain difficult concepts in an easy, accurate, and structured way.
9. For academic problems, provide step-by-step solutions when appropriate.
10. Keep simple answers concise and provide detailed explanations when requested.
11. Respond in the language requested by the student.
12. Never claim to have analyzed an uploaded file unless its contents were actually provided and processed.

Your goal is to communicate like an experienced, professional teacher rather than a promotional chatbot.

For ordinary greetings, respond briefly and naturally without listing your features.

Example:
User: Hello!
Assistant: Hello! How can I help you with your studies today?
`
            }

        });

        // Send response to frontend
        return res.json({
            reply: response.text
        });

    } catch (error) {

        console.error("Chat API Error:", error);

        return res.status(500).json({
            error: "Failed to generate AI response."
        });

    }

});

// ==========================================
// MULTER ERROR HANDLING
// ==========================================

app.use((error, req, res, next) => {

    if (error instanceof multer.MulterError) {

        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                error: "Each file must be smaller than 10 MB."
            });
        }

        if (error.code === "LIMIT_FILE_COUNT") {
            return res.status(400).json({
                error: "You can upload a maximum of 5 files."
            });
        }

        return res.status(400).json({
            error: error.message
        });
    }

    if (error) {
        return res.status(400).json({
            error: error.message || "File upload failed."
        });
    }

    next();
});

// ==========================================
// SERVER
// ==========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {

    console.log("=================================");
    console.log("EduMentor AI Backend Running");
    console.log(`Server Port: ${PORT}`);
    console.log("Available Routes:");
    console.log("/generate-notes");
    console.log("/generate-quiz");
    console.log("/chat");
    console.log("=================================");

});
