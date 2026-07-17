export type OrganizationRole = 'owner' | 'admin' | 'member';
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Workspace {
  readonly workspace_id: string;
  readonly organization_id: string;
  readonly name: string;
  readonly slug: string;
  readonly is_personal: boolean;
  readonly role: WorkspaceRole;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface WorkspaceMember {
  readonly workspace_id: string;
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly role: WorkspaceRole;
  readonly created_at: string;
}
