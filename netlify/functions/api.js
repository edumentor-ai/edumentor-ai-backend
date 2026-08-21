const express = require("express");
const cors = require("cors");

const { GoogleGenAI } = require("@google/genai");
const serverless = require("serverless-http");

// ==========================================
// INITIALIZE GEMINI INSTANCES
// ==========================================

const aiNotes = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY_NOTES
});

const aiQuiz = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY_QUIZ
});

const app = express();

app.use(cors());
app.use(express.json());

// ==========================================
// TEST ROUTE
// ==========================================

app.get("/", (req, res) => {
    res.send("EduMentor AI Backend Running");
});

// ==========================================
// AI NOTES GENERATOR
// ==========================================

app.post("/api/generate-notes", async (req, res) => {
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
  "keyPoints": [
    "Point 1",
    "Point 2",
    "Point 3",
    "Point 4",
    "Point 5"
  ],
  "questions": [
    "Question 1",
    "Question 2",
    "Question 3",
    "Question 4",
    "Question 5"
  ],
  "tips": "Revision tip 1...\\nRevision tip 2..."
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
// SHUFFLE ARRAY
// ==========================================

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
}

// ==========================================
// AI QUIZ GENERATOR
// ==========================================

app.post("/api/generate-quiz", async (req, res) => {

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
Language: ${language || "English"}

Return strictly a JSON array of objects:
[
  {
    "question": "Question text here",
    "options": [
      "Option A",
      "Option B",
      "Option C",
      "Option D"
    ],
    "answer": "Exact text of the correct option"
  }
]
`,

            config: {
                responseMimeType: "application/json"
            }
        });

        let quiz = JSON.parse(response.text);

        quiz = quiz.map(q => ({
            ...q,
            options: shuffleArray([...q.options])
        }));

        return res.json({
            quiz
        });

    } catch (error) {
        console.error("Quiz API Error:", error);

        return res.status(500).json({
            error: "Failed to generate quiz."
        });
    }

});

// ==========================================
// NETLIFY SERVERLESS HANDLER
// ==========================================

module.exports.handler = serverless(app);
