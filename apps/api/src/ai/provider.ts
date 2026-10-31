/**
 * LLM Provider Connector:
 * Integrates external AI models (Google Gemini, Groq, OpenAI) and provides a smart
 * local fallback engine to query MongoDB financial records without an external API key.
 */
import { getEnv } from '../config/env';
import { logger } from '../config/logger';
import { Company } from '../models/Company';
import { Party } from '../models/Party';
import { requestContext } from '../plugins/tenantScope';
import { narrateToolResult, narrateTrialBalance } from "./narrate";
import { setLlmProvider, type LlmMessage, type LlmProvider, type LlmToolSpec, type LlmTurn } from './gateway';

export function initLlmProvider(): void {
  const env = getEnv();

  const geminiKey = process.env.GEMINI_API_KEY || (env as Record<string, unknown>).GEMINI_API_KEY as string;
  const groqKey = process.env.GROQ_API_KEY || (env as Record<string, unknown>).GROQ_API_KEY as string;
  const openaiKey = process.env.OPENAI_API_KEY || (env as Record<string, unknown>).OPENAI_API_KEY as string;

  // Validate Gemini key format before using it — valid keys start with 'AIza'
  if (geminiKey && geminiKey.startsWith('AIza')) {
    logger.info('Initializing Gemini AI Provider for FinPilot Copilot');
    setLlmProvider(createGeminiProvider(geminiKey));
    return;
  }
  if (geminiKey) {
    logger.warn('GEMINI_API_KEY is set but appears invalid (should start with AIza…). Skipping Gemini.');
  }

  if (groqKey) {
    logger.info('Initializing Groq AI Provider for FinPilot Copilot');
    setLlmProvider(createGroqProvider(groqKey));
    return;
  }

  if (openaiKey) {
    logger.info('Initializing OpenAI Provider for FinPilot Copilot');
    setLlmProvider(createOpenAiProvider(openaiKey));
    return;
  }

  logger.info('No valid LLM API Key detected. Initializing Smart Financial Copilot Engine (instant responses).');
  setLlmProvider(createSmartDevProvider());
}

/**
 * Gemini LLM Provider (Google Gemini API v1beta)
 * Caches failures so subsequent calls in the same turn (or process)
 * skip the network roundtrip and go straight to the smart engine.
 */
function createGeminiProvider(apiKey: string): LlmProvider {
  let geminiDown = false;
  let downSince = 0;

  return {
    async chat(messages: LlmMessage[], tools: LlmToolSpec[]): Promise<LlmTurn> {
      const userMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';
      const lastMsg = messages[messages.length - 1];

      // If Gemini failed recently (within 60s), skip and use smart engine immediately
      if (geminiDown && Date.now() - downSince < 60_000) {
        logger.debug('Gemini still in cooldown, using smart engine');
        return fallbackSmartTurn(userMsg, messages, tools);
      }

      /**
       * Whose books are these? Without this the model sees a bare list of
       * company-like names under "Available Customers", is told nothing about
       * the company in context, and concludes it must ask the user which one
       * to report on — so "what is my revenue" came back as "which company's
       * revenue?". The tenant plugin already pins every tool to this company
       * (I8); the model just had no way to know that.
       */
      let companyContext = '';
      try {
        const ctx = requestContext.getStore();
        if (ctx?.companyId) {
          const company = await Company.findById(ctx.companyId)
            .select('legalName tradeName gstin stateCode')
            .lean();
          if (company) {
            companyContext =
              `You are working on the books of ${company.tradeName || company.legalName}` +
              (company.gstin ? ` (GSTIN ${company.gstin})` : '') +
              `. Every tool you call already reports on THIS company only — never ask the user ` +
              `which company or which customer to report on, and never treat this company as a customer.`;
          }
        }
      } catch {
        // tenant context may not be present in stub/unit tests
      }

      // Customers are counterparties for invoice drafting — NOT a set of
      // companies to choose between when answering a reporting question.
      let customerContext = '';
      try {
        const customers = await Party.find({ type: 'customer', deletedAt: null }).select('_id name').lean();
        if (customers.length > 0) {
          customerContext =
            `Customers (counterparties you invoice — use ONLY when drafting an invoice, ` +
            `never to disambiguate a reporting question):\n` +
            customers.map((c) => `- ${c.name} (partyId: "${c._id}")`).join('\n');
        }
      } catch {
        // tenant context may not be present in stub/unit tests
      }

      const toolDescriptions = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');

      let prompt = '';
      if (lastMsg && lastMsg.role === 'tool') {
        prompt = `
You are FinPilot, a smart, concise personal financial AI assistant for Indian SMEs.
User question: "${userMsg}"
Tool result received:
${lastMsg.content}

Instructions:
1. Provide a direct, natural response answering the user's question using ONLY figures from the tool result.
2. If this was an invoice proposal (type: "invoice" or contains "proposalId"), confirm to the user that the invoice draft proposal has been prepared and they can review and confirm it in the Proposal Inbox below.
3. Every figure you state MUST come directly from the tool result. Do NOT invent any numbers.
Return JSON with format:
{"content": "Your text response here"}
`;
      } else {
        prompt = `
You are FinPilot, a helpful personal AI assistant and financial copilot for Indian SMEs.
${companyContext}
User message: "${userMsg}"

Available tools:
${toolDescriptions}

${customerContext}

Instructions:
1. If the user is just saying hello, hi, greeting you, or casual small talk (e.g. "hii", "hello", "hey", "how are you", "what's up", "who are you"):
   - Respond naturally, conversationally and concisely as a personal chatbot (e.g. "Hello! How can I help you today?" or "Hi! Doing great, how are you? How can I help with your books today?").
   - DO NOT dump a huge feature list or ledger brochure unless the user asks for help or features. Do only what they asked.
2. If the user asks to fetch, view, check, or retrieve data (revenue, income, expenses, profit/loss, cash position, bank balance, aged receivables, health score, forecast):
   - Automatically call the appropriate tool.
3. If the user asks to draft, create, or generate an invoice:
   - Call the "proposeInvoice" tool with:
     "partyId": the ID of the matched customer
     "issueDate": "${new Date().toISOString().slice(0, 10)}"
     "lines": [{ "description": "...", "qty": 1, "ratePaise": amount_in_paise, "gstRate": 18 }]
4. Return JSON with format:
{"toolCall": {"name": "toolName", "args": {...}}} OR {"content": "Your natural text response here"}
`;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          },
        );
        clearTimeout(timeout);

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          throw new Error(`Gemini API ${response.status}: ${errBody.slice(0, 200)}`);
        }

        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(rawText) as {
          toolCall?: { name: string; args: Record<string, unknown> };
          content?: string;
        };

        // Gemini succeeded — clear any cached failure
        geminiDown = false;
        logger.info('Gemini API responded successfully');
        return {
          content: parsed.content,
          toolCall: parsed.toolCall,
          tokens: 50,
        };
      } catch (err) {
        logger.warn({ err: String(err) }, 'Gemini API call failed, using smart financial engine');
        geminiDown = true;
        downSince = Date.now();
        return fallbackSmartTurn(userMsg, messages, tools);
      }
    },
  };
}

/**
 * Groq / OpenAI OpenAI-compatible Provider
 */
function createGroqProvider(apiKey: string): LlmProvider {
  return createOpenAiCompatibleProvider(apiKey, 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile');
}

function createOpenAiProvider(apiKey: string): LlmProvider {
  return createOpenAiCompatibleProvider(apiKey, 'https://api.openai.com/v1', 'gpt-4o-mini');
}

function createOpenAiCompatibleProvider(apiKey: string, baseUrl: string, model: string): LlmProvider {
  return {
    async chat(messages: LlmMessage[], tools: LlmToolSpec[]): Promise<LlmTurn> {
      const formattedMsgs = messages.map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content,
      }));

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: formattedMsgs,
          tools: tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: { type: 'object', properties: {} } },
          })),
        }),
      });

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{ function?: { name: string; arguments: string } }>;
          };
        }>;
        usage?: { total_tokens?: number };
      };

      const choice = data.choices?.[0]?.message;
      if (choice?.tool_calls?.[0]?.function) {
        const fn = choice.tool_calls[0].function;
        let args = {};
        try {
          args = JSON.parse(fn.arguments || '{}');
        } catch {
          args = {};
        }
        return {
          toolCall: { name: fn.name, args },
          tokens: data.usage?.total_tokens || 50,
        };
      }

      return {
        content: choice?.content || 'I have analyzed your financial books.',
        tokens: data.usage?.total_tokens || 50,
      };
    },
  };
}

/**
 * Smart Dev Provider: Analyzes financial intent and calls real ledger tools
 * when no external cloud LLM key is configured.
 */
function createSmartDevProvider(): LlmProvider {
  return {
    async chat(messages: LlmMessage[], tools: LlmToolSpec[]): Promise<LlmTurn> {
      const userMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';
      return fallbackSmartTurn(userMsg, messages, tools);
    },
  };
}

async function fallbackSmartTurn(
  userMsg: string,
  messages: LlmMessage[],
  tools: LlmToolSpec[],
): Promise<LlmTurn> {
  const toolMap = new Set(tools.map((t) => t.name));
  const lastMsg = messages[messages.length - 1];

  // 1. Tool Turn: the last message is a tool result — narrate it in prose.
  // narrateToolResult knows every shape the registry can return; it prints
  // money through formatINR so the I9 grounding check still accepts it.
  if (lastMsg && lastMsg.role === "tool") {
    try {
      const parsed: unknown = JSON.parse(lastMsg.content);

      // The trial balance comes back as a bare array, not an object.
      if (Array.isArray(parsed)) {
        return { content: narrateTrialBalance(parsed as Record<string, unknown>[]), tokens: 10 };
      }

      const res = parsed as Record<string, unknown>;
      const prose = narrateToolResult(res);
      if (prose) return { content: prose, tokens: 10 };

      // Unknown shape. Say so plainly rather than printing the raw object:
      // a wall of JSON with paise in it is not an answer.
      return {
        content:
          "I retrieved that from your books, but I could not summarise this particular result. Ask me for it a different way and I will try again.",
        tokens: 5,
      };
    } catch {
      return { content: "I retrieved details from your books, but could not read the result.", tokens: 5 };
    }
  }

  // 2. User Turn: Determine intent based on user's message
  const q = userMsg.toLowerCase().trim();

  // A) Pure greetings / small talk: Do ONLY that, just like a personal chatbot!
  if (/^(hi|hii|hiii|hello|hey|heyy|howdy|hola)[!.,? ]*$/i.test(q)) {
    const greetings = [
      'Hello! How can I help you today?',
      'Hi there! What can I do for you today?',
      'Hey! How can I assist you today?',
      'Hello! How can I help with your books today?',
    ];
    const pick = greetings[q.length % greetings.length] || 'Hello! How can I help you today?';
    return { content: pick, tokens: 5 };
  }

  if (/^(how are you|how're you|how r u|how are you doing)[!.,? ]*$/i.test(q)) {
    return {
      content: "I'm doing great, thank you! How are you doing today? Let me know if you need any help with your books.",
      tokens: 10,
    };
  }

  if (/^(good morning|good afternoon|good evening|good night)[!.,? ]*$/i.test(q)) {
    const timeGreeting = q.includes('morning')
      ? 'Good morning!'
      : q.includes('afternoon')
        ? 'Good afternoon!'
        : q.includes('night')
          ? 'Good night!'
          : 'Good evening!';
    return { content: `${timeGreeting} How can I help you today?`, tokens: 5 };
  }

  if (/^(who are you|what is your name|what are you)[!.,? ]*$/i.test(q)) {
    return {
      content:
        "I'm FinPilot, your personal AI financial copilot. I can help answer questions about your business, check revenue and cash position, or draft invoices whenever you need.",
      tokens: 15,
    };
  }

  if (/^(what can you do|help|features)[!.,? ]*$/i.test(q)) {
    return {
      content:
        'Here is what I can do for you:\n• Check revenue, expenses, and profit & loss\n• Check your cash and bank balance\n• View aged accounts receivable\n• Draft invoices and journal entries for your confirmation\n\nWhat would you like to check?',
      tokens: 20,
    };
  }

  // B) Invoice drafting / write proposal
  if (
    (q.includes('draft') || q.includes('create invoice') || q.includes('new invoice') || q.includes('invoice for') || q.includes('bill')) &&
    toolMap.has('proposeInvoice')
  ) {
    let partyId = '';
    try {
      const customers = await Party.find({ type: 'customer', deletedAt: null }).select('_id name').lean();
      if (customers.length > 0) {
        const matched = customers.find((c) => q.includes(c.name.toLowerCase()));
        const selected = matched ?? customers[0];
        if (selected) {
          partyId = String(selected._id);
        }
      }
    } catch {
      // ignore
    }

    if (!partyId) {
      return {
        content: 'No active customer found to draft an invoice for. Please register a customer in Parties first.',
        tokens: 5,
      };
    }

    // Extract amount
    const numbers = (q.match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g) || [])
      .map((n) => Number(n.replace(/,/g, '')))
      .filter((n) => n >= 100);
    const firstNum = numbers[0];
    const ratePaise = typeof firstNum === 'number' ? Math.round(firstNum * 100) : 1500000;

    // Extract GST rate
    const gstMatch = q.match(/(\d{1,2})%\s*gst/i) || q.match(/gst.*?(\d{1,2})%/i);
    const gstRate = gstMatch ? Number(gstMatch[1]) : 18;

    // Extract description
    let desc = 'Professional Services';
    if (q.includes('web design')) desc = 'Web Design Services';
    else if (q.includes('consulting')) desc = 'Cloud Consulting Services';
    else if (q.includes('development')) desc = 'Software Development Services';

    return {
      toolCall: {
        name: 'proposeInvoice',
        args: {
          partyId,
          issueDate: new Date().toISOString().slice(0, 10),
          lines: [
            {
              description: desc,
              qty: 1,
              ratePaise,
              gstRate,
            },
          ],
        },
      },
      tokens: 10,
    };
  }

  // C) Read tools
  if ((q.includes('revenue') || q.includes('income') || q.includes('sales')) && toolMap.has('getRevenue')) {
    return { toolCall: { name: 'getRevenue', args: {} }, tokens: 5 };
  }
  if ((q.includes('expense') || q.includes('cost') || q.includes('spending')) && toolMap.has('getExpenses')) {
    return { toolCall: { name: 'getExpenses', args: {} }, tokens: 5 };
  }
  if ((q.includes('profit') || q.includes('loss') || q.includes('p&l') || q.includes('pnl')) && toolMap.has('getProfitAndLoss')) {
    return { toolCall: { name: 'getProfitAndLoss', args: {} }, tokens: 5 };
  }
  if ((q.includes('cash') || q.includes('bank') || q.includes('position')) && toolMap.has('getCashPosition')) {
    return { toolCall: { name: 'getCashPosition', args: {} }, tokens: 5 };
  }
  if ((q.includes('health') || q.includes('score')) && toolMap.has('getHealthScore')) {
    return { toolCall: { name: 'getHealthScore', args: {} }, tokens: 5 };
  }
  if ((q.includes('forecast') || q.includes('future') || q.includes('predict')) && toolMap.has('getCashFlowForecast')) {
    return { toolCall: { name: 'getCashFlowForecast', args: {} }, tokens: 5 };
  }
  if ((q.includes('receivable') || q.includes('unpaid') || q.includes('due') || q.includes('owe')) && toolMap.has('getOutstandingReceivables')) {
    return { toolCall: { name: 'getOutstandingReceivables', args: {} }, tokens: 5 };
  }

  // D) Fallback guide
  return {
    content:
      'Hello! I am your FinPilot Copilot. You can ask me:\n• "What was my revenue this month?"\n• "What are my total expenses?"\n• "Show my profit & loss"\n• "What is my cash position?"\n• "Draft an invoice for Bharat Tech Solutions for ₹15,000 web design at 18% GST"',
    tokens: 10,
  };
}
