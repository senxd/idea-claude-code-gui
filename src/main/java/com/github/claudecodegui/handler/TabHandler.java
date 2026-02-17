package com.github.claudecodegui.handler;

import com.github.claudecodegui.ClaudeSDKToolWindow;
import com.github.claudecodegui.settings.TabStateService;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowManager;
import com.intellij.ui.content.Content;
import com.intellij.ui.content.ContentFactory;
import com.intellij.ui.content.ContentManager;


/**
 * Tab management handler
 * Handles creating new chat tabs in the tool window
 */
public class TabHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(TabHandler.class);
    private static final int MAX_TAB_NAME_LENGTH = 50;

    private static final String[] SUPPORTED_TYPES = {
        "create_new_tab",
        "update_tab_name"
    };

    public TabHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        if ("create_new_tab".equals(type)) {
            LOG.debug("[TabHandler] Processing create_new_tab");
            handleCreateNewTab();
            return true;
        }
        if ("update_tab_name".equals(type)) {
            handleUpdateTabName(content);
            return true;
        }
        return false;
    }

    /**
     * Create a new chat tab in the tool window
     */
    private void handleCreateNewTab() {
        Project project = context.getProject();

        ApplicationManager.getApplication().invokeLater(() -> {
            try {
                // Get the tool window
                ToolWindow toolWindow = ToolWindowManager.getInstance(project).getToolWindow("CCG");
                if (toolWindow == null) {
                    LOG.error("[TabHandler] Tool window not found");
                    callJavaScript("addErrorMessage", escapeJs("无法找到 CCG 工具窗口"));
                    return;
                }

                // Create a new chat window instance with skipRegister=true (don't replace the main instance)
                ClaudeSDKToolWindow.ClaudeChatWindow newChatWindow = new ClaudeSDKToolWindow.ClaudeChatWindow(project, true);

                // Get tab index before adding content
                ContentManager contentManager = toolWindow.getContentManager();
                int tabIndex = contentManager.getContentCount();

                // Check if there's a saved name for this tab index
                TabStateService tabStateService = TabStateService.getInstance(project);
                String savedName = tabStateService.getTabName(tabIndex);

                // Create a tab name: use saved name or generate new one
                String tabName;
                if (savedName != null && !savedName.isEmpty()) {
                    tabName = savedName;
                    LOG.info("[TabHandler] Restored tab name from storage: " + tabName);
                } else {
                    tabName = ClaudeSDKToolWindow.getNextTabName(toolWindow);
                }

                // Create and add the new tab content
                ContentFactory contentFactory = ContentFactory.getInstance();
                Content content = contentFactory.createContent(newChatWindow.getContent(), tabName, false);
                content.setCloseable(true);
                newChatWindow.setParentContent(content);

                contentManager.addContent(content);
                contentManager.setSelectedContent(content);

                // Ensure the tool window is visible
                toolWindow.show(null);

                LOG.info("[TabHandler] Created new tab: " + tabName);
            } catch (Exception e) {
                LOG.error("[TabHandler] Error creating new tab: " + e.getMessage(), e);
                callJavaScript("addErrorMessage", escapeJs("创建新标签页失败: " + e.getMessage()));
            }
        });
    }

    private void handleUpdateTabName(String content) {
        Project project = context.getProject();

        ApplicationManager.getApplication().invokeLater(() -> {
            try {
                ToolWindow toolWindow = ToolWindowManager.getInstance(project).getToolWindow("CCG");
                if (toolWindow == null) {
                    LOG.warn("[TabHandler] Tool window not found for update_tab_name");
                    return;
                }

                ContentManager contentManager = toolWindow.getContentManager();
                Content selectedContent = contentManager.getSelectedContent();
                if (selectedContent == null) {
                    LOG.warn("[TabHandler] No selected tab for update_tab_name");
                    return;
                }

                String proposedName = extractTabName(content);
                if (proposedName == null || proposedName.isEmpty()) {
                    return;
                }

                String currentName = selectedContent.getDisplayName();
                if (proposedName.equals(currentName)) {
                    return;
                }

                ClaudeSDKToolWindow.ClaudeChatWindow tabWindow = ClaudeSDKToolWindow.getChatWindowForContent(selectedContent);
                if (tabWindow != null) {
                    tabWindow.renameTab(proposedName);
                } else {
                    selectedContent.setDisplayName(proposedName);
                }

                int tabIndex = contentManager.getIndexOfContent(selectedContent);
                if (tabIndex >= 0) {
                    TabStateService.getInstance(project).saveTabName(tabIndex, proposedName);
                }
            } catch (Exception e) {
                LOG.warn("[TabHandler] Failed to update tab name: " + e.getMessage(), e);
            }
        });
    }

    private String extractTabName(String content) {
        if (content == null) {
            return null;
        }

        String candidate = content.trim();
        if (candidate.isEmpty()) {
            return null;
        }

        if (candidate.startsWith("{")) {
            try {
                JsonObject json = new Gson().fromJson(candidate, JsonObject.class);
                if (json != null && json.has("title") && !json.get("title").isJsonNull()) {
                    candidate = json.get("title").getAsString().trim();
                }
            } catch (Exception ignored) {
                // Fall back to raw content.
            }
        }

        candidate = candidate.replaceAll("\\s+", " ").trim();
        if (candidate.isEmpty()) {
            return null;
        }

        return candidate.length() > MAX_TAB_NAME_LENGTH
            ? candidate.substring(0, MAX_TAB_NAME_LENGTH)
            : candidate;
    }
}
