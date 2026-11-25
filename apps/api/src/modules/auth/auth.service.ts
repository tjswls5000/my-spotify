import { Injectable } from '@nestjs/common';
import type { UserProfileDto } from '@my-spotify/shared-types';

@Injectable()
export class AuthService {
  getCurrentUser(): UserProfileDto | null {
    // TODO: Implement JWT / session-based authentication
    return null;
  }
}
