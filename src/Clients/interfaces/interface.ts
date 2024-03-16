export type CreateClientProperties = { 
  email : string
  cpf : string
  name : string
  phone : string
  city : string
  district : string
  state : string
  street : string
  zipcode : string
}

export type UpdateClientType = Partial<CreateClientProperties>

export interface ClientReturns {
  client_id : string
  email : string
  cpf : string
  name : string
  phone : string
  city : string
  district : string
  state : string
  street : string
  zipcode : string
  created_at : string
  
}

export type UpdateClientDTO = Partial<Record<keyof ClientReturns, string>>


export abstract class ClientRepositoryModel{
  abstract findByCpf(cpf : string) : Promise<void | object>
  abstract createClient(createClientObject : CreateClientProperties, user_id : number) : Promise<void | object> 
  abstract queryClients(query : string) : Promise<any []>

}