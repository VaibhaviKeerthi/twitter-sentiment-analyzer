import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { analyzeTweetSentimentLexicon } from "./src/utils/nlpLexicon";
import { SentimentType } from "./src/types";

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialize Gemini client
let ai: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!ai && process.env.GEMINI_API_KEY) {
    try {
      ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch (e) {
      console.error("Failed to initialize GoogleGenAI:", e);
    }
  }
  return ai;
}

// Check if API Key is available
app.get("/api/config-status", (req, res) => {
  res.json({
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    appUrl: process.env.APP_URL || "http://localhost:3000"
  });
});

// Endpoint 1: Analyze a single custom tweet
app.post("/api/analyze-tweet", async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Text is required in body" });
    return;
  }

  // 1. Run our Lexicon NLP on the text
  const lexiconAnalysis = analyzeTweetSentimentLexicon(text);

  // 2. Try to run Gemini NLP if available
  let geminiAnalysis = null;
  let geminiStatus = "not_configured";

  const client = getGeminiClient();
  if (client) {
    try {
      geminiStatus = "success";
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Analyze the sentiment of this tweet: "${text}"`,
        config: {
          systemInstruction: "You are an advanced Natural Language Processing (NLP) system. Perform deep sentiment analysis of the provided tweet. Classify sentiment as POSITIVE, NEGATIVE, or NEUTRAL. Also detect sarcasm, identify confidence score, and extract emotional keywords.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sentiment: {
                type: Type.STRING,
                description: "Must be exactly POSITIVE, NEGATIVE, or NEUTRAL"
              },
              confidence: {
                type: Type.NUMBER,
                description: "Sentiment classification confidence score (0.0 to 1.0)"
              },
              sarcasmDetected: {
                type: Type.BOOLEAN,
                description: "True if irony or sarcasm is detected, false otherwise"
              },
              emotions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of emotions detected (e.g. Joy, Frustration, Sarcasm, Hope, Anger)"
              },
              explanation: {
                type: Type.STRING,
                description: "A short, 1-2 sentence explanation focusing on linguistic cues (particles, emojis, slang)."
              }
            },
            required: ["sentiment", "confidence", "sarcasmDetected", "emotions", "explanation"]
          }
        }
      });

      const textResponse = response.text;
      if (textResponse) {
        geminiAnalysis = JSON.parse(textResponse.trim());
      }
    } catch (e: any) {
      console.error("Gemini single tweet analysis failed:", e);
      geminiStatus = `error: ${e.message || e}`;
    }
  } else {
    geminiStatus = "missing_api_key";
  }

  res.json({
    text,
    lexiconAnalysis,
    geminiAnalysis,
    geminiStatus
  });
});

// Primary fallback dynamic tweet generator when Gemini is missing
function generateProceduralTweets(query: string) {
  const normalized = query.toLowerCase();
  
  // Custom dummy users databases
  const users = [
    { name: "Sarah Jenkins", handle: "sarah_codes", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80" },
    { name: "Marcus Chen", handle: "marcus_t", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80" },
    { name: "Devon Patel", handle: "devon_codes", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80" },
    { name: "Elena Rostova", handle: "elena_design", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80" },
    { name: "Alex Mercer", handle: "mercer_tech", avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&h=150&q=80" },
    { name: "Chloe Williams", handle: "chloe_creative", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80" }
  ];

  let templates: { text: string; sentimentHint: SentimentType }[] = [];

  // Categorize based on query keywords
  if (normalized.includes("crypto") || normalized.includes("bitcoin") || normalized.includes("eth") || normalized.includes("coin")) {
    templates = [
      { text: `Absolutely loving the direction of ${query} lately! To the moon! 🚀💎🙌`, sentimentHint: SentimentType.POSITIVE },
      { text: `${query} is looking extremely volatile today. Be careful with those leveraged positions. 📉`, sentimentHint: SentimentType.NEUTRAL },
      { text: "Lost so much today on this dip. This is a total scam and completely ruined my week. Sucks so bad. 😭💥", sentimentHint: SentimentType.NEGATIVE },
      { text: `Just read the whitepaper of this new project using ${query} tech. Shows some promise but needs more audits.`, sentimentHint: SentimentType.NEUTRAL },
      { text: `The tech behind ${query} is brilliant! Best financial innovation of this decade. Incredible work.`, sentimentHint: SentimentType.POSITIVE },
      { text: `Another hack reported. This whole ${query} ecosystem feels so unsafe and poorly built. Terrible.`, sentimentHint: SentimentType.NEGATIVE }
    ];
  } else if (normalized.includes("apple") || normalized.includes("iphone") || normalized.includes("macbook") || normalized.includes("tech") || normalized.includes("phone")) {
    templates = [
      { text: `The new features in ${query} are amazing! Best phone upgrade in years, performance is outstanding. 😍⚡`, sentimentHint: SentimentType.POSITIVE },
      { text: `Comparing the specifications of ${query} against the competitors. Not much change, quite average.`, sentimentHint: SentimentType.NEUTRAL },
      { text: `My ${query} keeps crashing after the latest update. Extremely annoying, complete garbage update! 😡`, sentimentHint: SentimentType.NEGATIVE },
      { text: `Has anyone bought the new ${query}? Deciding if it's worth the premium price or if I should wait.`, sentimentHint: SentimentType.NEUTRAL },
      { text: `The design elegance of ${query} is superb. Perfectly clean and exceptionally helpful in my daily workflow.`, sentimentHint: SentimentType.POSITIVE },
      { text: `So slow! The battery life on ${query} sucks so bad, had to charge it twice before noon. Horrible experience!`, sentimentHint: SentimentType.NEGATIVE }
    ];
  } else if (normalized.includes("movie") || normalized.includes("film") || normalized.includes("netflix") || normalized.includes("show")) {
    templates = [
      { text: `Just watched ${query} and it was an absolute masterpiece! The acting was superb and ending was perfect. 🎬🌟`, sentimentHint: SentimentType.POSITIVE },
      { text: `Finally finished ${query}. A few cool scenes but the plot was somewhat slow and predictable.`, sentimentHint: SentimentType.NEUTRAL },
      { text: `Honestly hated ${query}. The script was stupid, actors looked bored, and it was a total waste of time. 🤢`, sentimentHint: SentimentType.NEGATIVE },
      { text: `Who has watched ${query}? I'm seeing such mixed reviews online. Is it worth buying tickets?`, sentimentHint: SentimentType.NEUTRAL },
      { text: `Wow, the cinematography in ${query} is beautiful and brilliant. Strongly recommend!`, sentimentHint: SentimentType.POSITIVE },
      { text: `That was a terrible film. Horrid pacing, loud annoying music, and ruined a perfectly good story. Fail.`, sentimentHint: SentimentType.NEGATIVE }
    ];
  } else {
    // General templates
    templates = [
      { text: `Honestly, ${query} has been a complete game changer for me! Loving every single bit of it. 🌟❤️`, sentimentHint: SentimentType.POSITIVE },
      { text: `Just checking out what people are discussing regarding ${query}. Always interesting to see different opinions.`, sentimentHint: SentimentType.NEUTRAL },
      { text: `Extremely disappointed with how ${query} is turning out. It sucks and makes things so much more difficult. 😤`, sentimentHint: SentimentType.NEGATIVE },
      { text: `Reading a new research article focused on ${query}. Gives some valid points but lacks historical evidence.`, sentimentHint: SentimentType.NEUTRAL },
      { text: `Shoutout to the team behind ${query}. Incredible, clean, and helpful work! Best support ever! 🙌`, sentimentHint: SentimentType.POSITIVE },
      { text: `I am so sick and tired of the problems with ${query}. It's useless, slow, and completely wrong. 😭`, sentimentHint: SentimentType.NEGATIVE }
    ];
  }

  // Populate tweets array with random variation
  return templates.map((template, idx) => {
    const user = users[idx % users.length];
    const date = new Date();
    date.setHours(date.getHours() - idx * 2 - Math.random() * 2);
    
    // Lexicon analyze
    const lexiconAnalysis = analyzeTweetSentimentLexicon(template.text);
    
    // Create simulated Gemini payload for fallback so frontend is uniform
    const geminiAnalysis = {
      sentiment: template.sentimentHint,
      confidence: 0.82 + (idx * 0.03),
      sarcasmDetected: false,
      emotions: template.sentimentHint === SentimentType.POSITIVE 
        ? ["Joy", "Excitement", "Admiration"] 
        : template.sentimentHint === SentimentType.NEGATIVE 
          ? ["Frustration", "Disappointment", "Anger"] 
          : ["Neutrality", "Curiosity"],
      explanation: `Lexical analyzer estimated score: ${lexiconAnalysis.normalizedScore.toFixed(2)}. Highly matching clues.`
    };

    return {
      id: `tweet_local_${idx}_${Date.now()}`,
      authorName: user.name,
      authorHandle: `@${user.handle}`,
      authorAvatar: user.avatar,
      text: template.text,
      createdAt: date.toISOString(),
      likes: Math.floor(Math.random() * 250) + (template.sentimentHint === SentimentType.POSITIVE ? 200 : 25),
      retweets: Math.floor(Math.random() * 80) + (template.sentimentHint === SentimentType.POSITIVE ? 40 : 5),
      lexiconAnalysis,
      geminiAnalysis
    };
  });
}

// Endpoint 2: Bulk feed Generation simulator
app.post("/api/generate-feed", async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Query parameter is required" });
    return;
  }

  const client = getGeminiClient();
  if (client) {
    try {
      const prompt = `Generate exactly 6 highly realistic simulated tweets about the search keyword or hashtag: "${query}".
They should represent contemporary social media discussions (Twitter/X style with slang, hashtags, and occasional emojis).
Ensure a balanced distribution: some positive, some neutral, some negative, and at least one showing mild sarcasm or frustration.
Analyze each tweet's sentiment content carefully and return as highly structured JSON.`;

      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: `You are a professional social media simulator and NLP analysis engine. Generate simulated tweets and immediately run standard sentiment classifications.
Return a structured list of tweet objects. Each tweet should possess:
- authorName (full realistic name)
- authorHandle (e.g. @tech_enthusiast)
- text (the realistic tweet text in English, mentioning the search query or using hashtags)
- likes (integer, e.g. 12 to 850)
- retweets (integer, e.g. 2 to 340)
- geminiSentiment (POS, NEG, or NEU)
- geminiConfidence (0 to 1)
- geminiSarcasm (boolean)
- geminiEmotions (array of strings, e.g. ["Hope", "Frustration", "Excitement"])
- geminiExplanation (brief string summary explaining the cues)`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                authorName: { type: Type.STRING },
                authorHandle: { type: Type.STRING },
                text: { type: Type.STRING },
                likes: { type: Type.INTEGER },
                retweets: { type: Type.INTEGER },
                geminiSentiment: { type: Type.STRING, description: "Must be POS, NEG, or NEU" },
                geminiConfidence: { type: Type.NUMBER },
                geminiSarcasm: { type: Type.BOOLEAN },
                geminiEmotions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                geminiExplanation: { type: Type.STRING }
              },
              required: [
                "authorName",
                "authorHandle",
                "text",
                "likes",
                "retweets",
                "geminiSentiment",
                "geminiConfidence",
                "geminiSarcasm",
                "geminiEmotions",
                "geminiExplanation"
              ]
            }
          }
        }
      });

      const responseText = response.text;
      if (responseText) {
        const rawFeed = JSON.parse(responseText.trim());
        
        // Transform the raw feed into standard Tweet objects
        const tweets = rawFeed.map((item: any, idx: number) => {
          // Resolve standard sentiment type
          let sentiment = SentimentType.NEUTRAL;
          const sentStr = String(item.geminiSentiment).toUpperCase();
          if (sentStr.startsWith("POS")) sentiment = SentimentType.POSITIVE;
          else if (sentStr.startsWith("NEG")) sentiment = SentimentType.NEGATIVE;
          
          // Lexicon analyze
          const lexiconAnalysis = analyzeTweetSentimentLexicon(item.text);

          const date = new Date();
          date.setMinutes(date.getMinutes() - idx * (15 + Math.floor(Math.random() * 20)));

          // Avatars mapping
          const avatars = [
            "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80",
            "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&h=150&q=80",
            "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=150&h=150&q=80",
            "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&h=150&q=80",
            "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&h=150&q=80",
            "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&h=150&q=80"
          ];

          return {
            id: `tweet_gemini_${idx}_${Date.now()}`,
            authorName: item.authorName,
            authorHandle: item.authorHandle.startsWith("@") ? item.authorHandle : `@${item.authorHandle}`,
            authorAvatar: avatars[idx % avatars.length],
            text: item.text,
            createdAt: date.toISOString(),
            likes: item.likes || Math.floor(Math.random() * 200),
            retweets: item.retweets || Math.floor(Math.random() * 50),
            lexiconAnalysis,
            geminiAnalysis: {
              sentiment,
              confidence: item.geminiConfidence || 0.85,
              sarcasmDetected: !!item.geminiSarcasm,
              emotions: item.geminiEmotions || ["Opinion"],
              explanation: item.geminiExplanation || "Contextually analyzed by LLM NLP pipeline."
            }
          };
        });

        res.json({
          query,
          tweets,
          geminiStatus: "success"
        });
        return;
      }
    } catch (e: any) {
      console.error("Gemini feed generation failing, using procedural fallback:", e);
    }
  }

  // Fallback to offline procedural generator
  const tweets = generateProceduralTweets(query);
  res.json({
    query,
    tweets,
    geminiStatus: client ? "rate_limit_fallback" : "offline_fallback"
  });
});

async function startServer() {
  // Vite dev server support
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server executing on port ${PORT}`);
  });
}

startServer();
