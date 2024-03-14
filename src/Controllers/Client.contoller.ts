import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { CreateClientBody } from "src/dtos/create-client-body";
import { ClientService } from "src/repository/prisma/ClientService";

interface QueryRequest extends Request {
  query : {q : string} 
}
@Controller("clients")
export class ClientsControllers {

  constructor(private clientService : ClientService) {}

  @Post("create")
  async createClient(@Body() body : CreateClientBody) {
    const {cpf} = body
    const clientExists = await this.clientService.findByCpf(cpf)
    if(clientExists){
      console.log(`usuario ja cadastrado, deseja continuar?`)
      return {
        message : "client ja existente na aplicacao, deseja continuar?"
      }
    }
    const client = await this.clientService.create(body)
    
    return {client}

  }
  @Post("force-create")
  async acceptCondition(@Body() body : CreateClientBody) {
    const allData = body
    const client = await this.clientService.create(allData)
    return {client}
  }
  @Get("view")
  async viewClient(@Req() req : QueryRequest) {
    const { q } = req.query
    const clients = await this.clientService.queryClients(q)
    return {
      clients
    }
  }
  @Get("viewlatest")
  async viewLatestClients() {
    
  } 
}