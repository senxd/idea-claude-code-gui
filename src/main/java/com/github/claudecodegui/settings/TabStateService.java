package com.github.claudecodegui.settings;

import com.intellij.openapi.components.*;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.HashMap;
import java.util.Map;

/**
 * 标签页状态持久化服务
 * 负责保存和恢复标签页的自定义名称
 */
@State(
    name = "ClaudeCodeTabState",
    storages = @Storage("claudeCodeTabState.xml")
)
@Service(Service.Level.PROJECT)
public final class TabStateService implements PersistentStateComponent<TabStateService.State> {

    private static final Logger LOG = Logger.getInstance(TabStateService.class);

    private State myState = new State();

    public static TabStateService getInstance(@NotNull Project project) {
        return project.getService(TabStateService.class);
    }

    @Override
    public @Nullable State getState() {
        return myState;
    }

    @Override
    public void loadState(@NotNull State state) {
        myState = state;
        LOG.info("[TabStateService] Loaded tab state with " + state.tabNames.size() + " entries");
    }

    /**
     * 保存标签页名称
     * @param tabIndex 标签页索引
     * @param tabName 标签页名称
     */
    public void saveTabName(int tabIndex, String tabName) {
        if (tabName != null && !tabName.trim().isEmpty()) {
            myState.tabNames.put(tabIndex, tabName);
            LOG.info("[TabStateService] Saved tab name: index=" + tabIndex + ", name=" + tabName);
        }
    }

    /**
     * 获取标签页名称
     * @param tabIndex 标签页索引
     * @return 标签页名称，如果未设置返回 null
     */
    @Nullable
    public String getTabName(int tabIndex) {
        return myState.tabNames.get(tabIndex);
    }

    /**
     * 移除标签页名称
     * @param tabIndex 标签页索引
     */
    public void removeTabName(int tabIndex) {
        myState.tabNames.remove(tabIndex);
        LOG.info("[TabStateService] Removed tab name for index: " + tabIndex);
    }

    /**
     * 获取所有标签页名称
     * @return 标签页索引到名称的映射
     */
    public Map<Integer, String> getAllTabNames() {
        return new HashMap<>(myState.tabNames);
    }

    /**
     * 保存标签页对应的会话 ID
     * @param tabIndex 标签页索引
     * @param sessionId 会话 ID
     */
    public void saveTabSessionId(int tabIndex, String sessionId) {
        if (sessionId != null && !sessionId.trim().isEmpty()) {
            myState.tabSessionIds.put(tabIndex, sessionId);
            LOG.info("[TabStateService] Saved tab sessionId: index=" + tabIndex + ", sessionId=" + sessionId);
        }
    }

    /**
     * 获取标签页对应的会话 ID
     * @param tabIndex 标签页索引
     * @return 会话 ID，若不存在返回 null
     */
    @Nullable
    public String getTabSessionId(int tabIndex) {
        return myState.tabSessionIds.get(tabIndex);
    }

    /**
     * 移除标签页对应的会话 ID
     * @param tabIndex 标签页索引
     */
    public void removeTabSessionId(int tabIndex) {
        myState.tabSessionIds.remove(tabIndex);
        LOG.info("[TabStateService] Removed tab sessionId for index: " + tabIndex);
    }

    /**
     * 清除所有标签页名称
     */
    public void clearAllTabNames() {
        myState.tabNames.clear();
        LOG.info("[TabStateService] Cleared all tab names");
    }

    /**
     * 清除所有标签页会话 ID
     */
    public void clearAllTabSessionIds() {
        myState.tabSessionIds.clear();
        LOG.info("[TabStateService] Cleared all tab session IDs");
    }

    /**
     * 更新标签页索引（当标签页被删除时，需要重新映射索引）
     * @param removedIndex 被删除的标签页索引
     */
    public void onTabRemoved(int removedIndex) {
        // 移除被删除标签页的名称
        myState.tabNames.remove(removedIndex);
        // 移除被删除标签页的会话 ID
        myState.tabSessionIds.remove(removedIndex);

        // 将所有大于 removedIndex 的索引减 1
        Map<Integer, String> newMap = new HashMap<>();
        for (Map.Entry<Integer, String> entry : myState.tabNames.entrySet()) {
            int oldIndex = entry.getKey();
            if (oldIndex > removedIndex) {
                newMap.put(oldIndex - 1, entry.getValue());
            } else {
                newMap.put(oldIndex, entry.getValue());
            }
        }
        myState.tabNames = newMap;

        // 将所有大于 removedIndex 的会话索引减 1
        Map<Integer, String> newSessionMap = new HashMap<>();
        for (Map.Entry<Integer, String> entry : myState.tabSessionIds.entrySet()) {
            int oldIndex = entry.getKey();
            if (oldIndex > removedIndex) {
                newSessionMap.put(oldIndex - 1, entry.getValue());
            } else {
                newSessionMap.put(oldIndex, entry.getValue());
            }
        }
        myState.tabSessionIds = newSessionMap;

        // 更新标签页数量
        if (myState.tabCount > 0) {
            myState.tabCount--;
        }

        LOG.info("[TabStateService] Updated tab indexes after removal of index: " + removedIndex + ", new count: " + myState.tabCount);
    }

    /**
     * 保存标签页数量
     * @param count 标签页数量
     */
    public void saveTabCount(int count) {
        myState.tabCount = count;
        LOG.info("[TabStateService] Saved tab count: " + count);
    }

    /**
     * 获取标签页数量
     * @return 标签页数量，默认为 1
     */
    public int getTabCount() {
        return Math.max(1, myState.tabCount);
    }

    /**
     * 持久化状态类
     */
    public static class State {
        /**
         * 标签页索引到名称的映射
         */
        public Map<Integer, String> tabNames = new HashMap<>();

        /**
         * 标签页索引到会话 ID 的映射
         */
        public Map<Integer, String> tabSessionIds = new HashMap<>();

        /**
         * 标签页数量
         */
        public int tabCount = 1;
    }
}
