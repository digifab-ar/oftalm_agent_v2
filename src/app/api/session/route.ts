import { NextResponse } from "next/server";

const REALTIME_MODEL = "gpt-realtime-mini-2025-12-15";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { message: "OPENAI_API_KEY is not configured" } },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expires_after: {
            anchor: "created_at",
            seconds: 600,
          },
          session: {
            type: "realtime",
            model: REALTIME_MODEL,
            output_modalities: ["audio"],
            audio: {
              input: {
                transcription: { model: "gpt-4o-mini-transcribe" },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.9,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                  create_response: true,
                },
              },
              output: { voice: "alloy" },
            },
          },
        }),
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error in /session:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
