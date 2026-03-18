import { useCallback } from 'react';
import { useAppContext } from '../context/app-context.js';

export function useApproval() {
  const { state, dispatch } = useAppContext();

  const approve = useCallback(() => {
    if (state.pendingApproval) {
      state.pendingApproval.resolve(true);
      dispatch({ type: 'SET_PENDING_APPROVAL', approval: null });
    }
  }, [state.pendingApproval, dispatch]);

  const deny = useCallback(() => {
    if (state.pendingApproval) {
      state.pendingApproval.resolve(false);
      dispatch({ type: 'SET_PENDING_APPROVAL', approval: null });
    }
  }, [state.pendingApproval, dispatch]);

  return {
    pending: state.pendingApproval,
    approve,
    deny,
  };
}
