export type UserRegistrationType = {
  username : string
  email : string
  password : string
}

export abstract class UserServiceAbstraction {
  abstract findByEmail(email : string) : Promise<void | {email : string}>
  abstract create(data : UserRegistrationType) : Promise<void | object>
}