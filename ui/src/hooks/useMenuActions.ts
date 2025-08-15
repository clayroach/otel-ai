import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';

export const useMenuActions = () => {
  const navigate = useNavigate();
  const { setActiveQuery } = useAppStore();

  useEffect(() => {
    // Only set up Electron menu handlers if we're in Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      const handleMenuAction = (action: string, data?: any) => {
        switch (action) {
          case 'new-query':
            setActiveQuery('');
            break;
          
          case 'open-query':
            // TODO: Open file dialog for query
            console.log('Open query dialog');
            break;
          
          case 'save-query':
            // TODO: Save current query
            console.log('Save query');
            break;
          
          case 'preferences':
            // TODO: Open preferences modal
            console.log('Open preferences');
            break;
          
          case 'navigate':
            if (data) {
              navigate(`/${data}`);
            }
            break;
          
          case 'run-query':
            // TODO: Execute current query
            console.log('Run query');
            break;
          
          case 'format-query':
            // TODO: Format current query
            console.log('Format query');
            break;
          
          case 'ai-suggestions':
            // TODO: Show AI query suggestions
            console.log('Show AI suggestions');
            break;
          
          case 'about':
            // TODO: Show about dialog
            console.log('Show about dialog');
            break;
          
          default:
            console.log('Unknown menu action:', action);
        }
      };

      window.electronAPI.onMenuAction(handleMenuAction);

      // Cleanup
      return () => {
        window.electronAPI.removeAllListeners();
      };
    }
  }, [navigate, setActiveQuery]);
};