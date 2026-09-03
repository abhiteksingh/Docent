from typing import Optional, Union, Dict
from backend.app.workspaces.types import WorkspaceType
from backend.app.workspaces.base import BaseWorkspace
from backend.app.workspaces.general_chat import GeneralChatWorkspace
from backend.app.workspaces.spaced_learning import SpacedLearningWorkspace
from backend.app.workspaces.contract_auditor import ContractAuditorWorkspace
from backend.app.workspaces.interview_simulator import InterviewSimulatorWorkspace
from backend.app.workspaces.spreadsheet_analytics import SpreadsheetAnalyticsWorkspace

# Registry mapping WorkspaceType to singleton workspace instances
_WORKSPACE_REGISTRY: Dict[WorkspaceType, BaseWorkspace] = {
    WorkspaceType.GENERAL: GeneralChatWorkspace(),
    WorkspaceType.CHAT: GeneralChatWorkspace(),
    WorkspaceType.SPACED_LEARNING: SpacedLearningWorkspace(),
    WorkspaceType.CONTRACT_AUDITOR: ContractAuditorWorkspace(),
    WorkspaceType.INTERVIEW_SIMULATOR: InterviewSimulatorWorkspace(),
    WorkspaceType.SPREADSHEET_ANALYTICS: SpreadsheetAnalyticsWorkspace(),
}




def register_workspace(ws_type: WorkspaceType, handler: BaseWorkspace) -> None:
    _WORKSPACE_REGISTRY[ws_type] = handler

def get_workspace(workspace_type: Optional[Union[str, WorkspaceType]]) -> Optional[BaseWorkspace]:
    """
    Returns the workspace handler for the given type/alias.
    If the workspace is not yet registered, returns None to allow phased fallback.
    """
    if isinstance(workspace_type, WorkspaceType):
        resolved_type = workspace_type
    else:
        resolved_type = WorkspaceType.from_str(workspace_type)
        
    return _WORKSPACE_REGISTRY.get(resolved_type)
