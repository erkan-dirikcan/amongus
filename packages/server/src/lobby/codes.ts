import { LOBBY_CODE_CHARS, LOBBY_CODE_LENGTH } from "@amongus/shared";

/**
 * Generate a random lobby code of 6 characters from the allowed charset
 * (A-Z without O, I and digits 2-9). Uniqueness is enforced by the caller
 * (LobbyManager checks the Map before accepting).
 */
export function generateLobbyCode(): string {
  let code = "";
  for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * LOBBY_CODE_CHARS.length);
    code += LOBBY_CODE_CHARS[idx];
  }
  return code;
}
