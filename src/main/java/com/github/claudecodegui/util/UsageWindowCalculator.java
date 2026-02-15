package com.github.claudecodegui.util;

import com.github.claudecodegui.provider.claude.ClaudeHistoryReader;
import com.github.claudecodegui.provider.codex.CodexHistoryReader;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;

import java.util.concurrent.TimeUnit;

/**
 * Computes rolling usage windows for status UI.
 */
public final class UsageWindowCalculator {

    private static final Logger LOG = Logger.getInstance(UsageWindowCalculator.class);
    private static final long FIVE_HOURS_MS = TimeUnit.HOURS.toMillis(5);

    private UsageWindowCalculator() {
        // Utility class
    }

    public static JsonObject calculate(String provider, String projectPath) {
        JsonObject result = new JsonObject();
        result.addProperty("last5hTokens", 0L);
        result.addProperty("currentWeekTokens", 0L);

        if (projectPath == null || projectPath.isEmpty()) {
            return result;
        }

        long now = System.currentTimeMillis();
        long fiveHourCutoff = now - FIVE_HOURS_MS;
        long fiveHourTokens = 0L;
        long currentWeekTokens = 0L;

        try {
            if ("codex".equals(provider)) {
                CodexHistoryReader reader = new CodexHistoryReader();
                CodexHistoryReader.ProjectStatistics stats = reader.getProjectStatistics(projectPath);

                if (stats != null) {
                    if (stats.weeklyComparison != null && stats.weeklyComparison.currentWeek != null) {
                        currentWeekTokens = Math.max(0L, stats.weeklyComparison.currentWeek.tokens);
                    }
                    if (stats.sessions != null) {
                        for (CodexHistoryReader.SessionSummary session : stats.sessions) {
                            if (session == null || session.usage == null) continue;
                            if (session.timestamp >= fiveHourCutoff) {
                                fiveHourTokens += Math.max(0L, session.usage.totalTokens);
                            }
                        }
                    }
                }
            } else {
                ClaudeHistoryReader reader = new ClaudeHistoryReader();
                ClaudeHistoryReader.ProjectStatistics stats = reader.getProjectStatistics(projectPath);

                if (stats != null) {
                    if (stats.weeklyComparison != null && stats.weeklyComparison.currentWeek != null) {
                        currentWeekTokens = Math.max(0L, stats.weeklyComparison.currentWeek.tokens);
                    }
                    if (stats.sessions != null) {
                        for (ClaudeHistoryReader.SessionSummary session : stats.sessions) {
                            if (session == null || session.usage == null) continue;
                            if (session.timestamp >= fiveHourCutoff) {
                                fiveHourTokens += Math.max(0L, session.usage.totalTokens);
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            LOG.warn("[UsageWindowCalculator] Failed to calculate usage windows: " + e.getMessage());
        }

        result.addProperty("last5hTokens", fiveHourTokens);
        result.addProperty("currentWeekTokens", currentWeekTokens);
        return result;
    }
}
