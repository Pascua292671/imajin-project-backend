import type { UserRole } from "../../Controller/UserController";
 
// Your register payload naming is inconsistent (Birthday vs birth_date vs birthday),
// so we normalize it here.
function normalizeBirthday(body: any) {
  return body.Birthday ?? body.birth_date ?? body.birthday ?? body.Birthday;
}

export function buildUserMirrorPayload(role: UserRole, params: {
  id: number;
  username: string;
  email: string;
  hashedPassword: string;
  body: any;
}) {
  const { id, username, email, hashedPassword, body } = params;
  const Birthday = normalizeBirthday(body);

  const phone_no = body.phone_no ?? body.contactNum ?? body.phoneNumber ?? null;
  const address = body.address ?? body.adress ?? null;
  const age = body.age ?? null;

  // NOTE: make sure these keys match SUPABASE columns exactly.
  if (role === "customer") {
    return {
      table: "customer",
      payload: {
        id,
        name: body.name,
        username,
        email,
        password: hashedPassword,   // optional: remove if you don’t want mirrored passwords
        phone_no,
        address,
        age,
        Birthday,
      },
    };
  }

  if (role === "artist") {
    return {
      table: "artist",
      payload: {
        id,
        Full_name: body.full_name,
        Stage_name: body.stage_name,
        username,
        email,
        password: hashedPassword,
        phone_no,
        address,
        age,
        Birthday,
        // contact_no exists in your supabase artist table screenshot
        contact_no: phone_no,
      },
    };
  }

  if (role === "sessionist") {
    return {
      table: "sessionist",
      payload: {
        id,
        Full_name: body.full_name,
        Stage_name: body.stage_name,
        username,
        email,
        password: hashedPassword,
        phone_no,
        address,
        age,
        Birthday,
      },
    };
  }

  if (role === "organizer") {
    return {
      table: "organizer",
      payload: {
        id,
        Organization_rep: body.organization_rep,
        username,
        email,
        password: hashedPassword,
        phone_no,
        address,
        age,
        Birthday,
      },
    };
  }

  throw new Error(`Unsupported role: ${role}`);
}