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

type order = {

}

export abstract class ClientRepositoryModel{
  abstract findByCpf(cpf : string) : Promise<void | object>
  abstract create(createClientObject : CreateClientProperties) : Promise<void | object> 
  abstract queryClients(query : string) : Promise<any []>
  abstract updateClient (SectionsToUpdate : UpdateClientType) : Promise<void | object>
}