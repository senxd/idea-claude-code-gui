package com.github.claudecodegui.util;

import com.github.claudecodegui.ClaudeSession;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.List;

/**
 * Extracts window usage data from SDK result payloads/messages when available.
 */
public final class SdkWindowUsageExtractor {

    private static final String[] WINDOW_USAGE_KEYS = new String[] {
        "windowUsage",
        "window_usage",
        "usageWindow",
        "usage_window",
        "planUsage",
        "plan_usage",
        "usageLimits",
        "usage_limits",
        "rateLimits",
        "rate_limits",
        "limitUsage",
        "limit_usage"
    };

    private SdkWindowUsageExtractor() {
    }

    public static JsonObject extractFromResult(JsonObject resultJson) {
        if (resultJson == null) {
            return null;
        }

        JsonObject extracted = extractWindowObject(resultJson);
        if (extracted != null) {
            return extracted;
        }

        if (resultJson.has("usage") && resultJson.get("usage").isJsonObject()) {
            return extractWindowObject(resultJson.getAsJsonObject("usage"));
        }

        return null;
    }

    public static JsonObject extractFromMessages(List<ClaudeSession.Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return null;
        }

        for (int i = messages.size() - 1; i >= 0; i--) {
            ClaudeSession.Message msg = messages.get(i);
            if (msg == null || msg.raw == null) {
                continue;
            }

            JsonObject extracted = extractWindowObject(msg.raw);
            if (extracted != null) {
                return extracted;
            }

            if (msg.raw.has("message") && msg.raw.get("message").isJsonObject()) {
                extracted = extractWindowObject(msg.raw.getAsJsonObject("message"));
                if (extracted != null) {
                    return extracted;
                }
            }
        }

        return null;
    }

    private static JsonObject extractWindowObject(JsonObject source) {
        if (source == null) {
            return null;
        }

        for (String key : WINDOW_USAGE_KEYS) {
            JsonElement value = source.get(key);
            if (value != null && value.isJsonObject()) {
                JsonObject copied = new JsonObject();
                value.getAsJsonObject().entrySet().forEach(e -> copied.add(e.getKey(), e.getValue()));
                if (!copied.entrySet().isEmpty()) {
                    return copied;
                }
            }
        }

        return null;
    }
}
