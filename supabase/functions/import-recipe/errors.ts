// An error the user should see, with the HTTP status to send it with. The app
// shows the code's translation.
export class ImportError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
