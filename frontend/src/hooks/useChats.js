// frontend/src/hooks/useChats.js
// State and actions for the persistent chat session list.
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import * as api from '../services/api.js';

export function useChats() {
  const [sessions, setSessions]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listChats();
      setSessions(data.sessions ?? []);
    } catch (err) {
      setError(err.message);
      // Don't toast on initial load — backend may not be running
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createChat = useCallback(async (firstQuery) => {
    try {
      const data = await api.createChat(firstQuery);
      setSessions(prev => [data.session, ...prev]);
      return data.session;
    } catch (err) {
      toast.error(`Failed to create chat: ${err.message}`);
      return null;
    }
  }, []);

  const renameChat = useCallback(async (chatId, title) => {
    try {
      const data = await api.renameChat(chatId, title);
      setSessions(prev => prev.map(s => s.id === chatId ? { ...s, title: data.session.title } : s));
      return true;
    } catch (err) {
      toast.error(`Failed to rename: ${err.message}`);
      return false;
    }
  }, []);

  const deleteChat = useCallback(async (chatId) => {
    try {
      await api.deleteChat(chatId);
      setSessions(prev => prev.filter(s => s.id !== chatId));
      toast.success('Chat deleted');
      return true;
    } catch (err) {
      toast.error(`Failed to delete: ${err.message}`);
      return false;
    }
  }, []);

  return { sessions, loading, error, createChat, renameChat, deleteChat, reload: load };
}
