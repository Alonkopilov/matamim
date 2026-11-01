export interface Account {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  code?: string;
}

export interface AccountValidity {
  fullName: boolean;
  email: boolean;
  password: boolean;
  confirmPassword: boolean;
  code: boolean;
}

// "forgot" asks for the email, "reset" for the emailed code and a new password,
// "confirm" for the code emailed at sign-up
export type AccountMode =
  "login" | "register" | "confirm" | "forgot" | "reset" | "connected";

export const PERFECT_ACCOUNT = (): AccountValidity => {
  return {
    fullName: false,
    email: false,
    password: false,
    confirmPassword: false,
    code: false,
  };
};

export const EMPTY_ACCOUNT = (): Account => {
  return {
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    code: "",
  };
};
