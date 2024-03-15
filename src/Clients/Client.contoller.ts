import { Body, Controller, Get, Post, Req, UnauthorizedException } from "@nestjs/common";
import { CreateClientBody } from "src/Clients/dto/create-client";
import { ClientService } from "src/Clients/Client.service";

interface QueryRequest extends Request {
  query : {q : string} 
}
@Controller("clients")
export class ClientsControllers {

  constructor(private clientService : ClientService) {}

  @Post("create")
  async createClient(@Body() body : CreateClientBody) {
    const {cpf, email} = body
    const clientExists = await this.clientService.findByCpf(cpf)

    const clientExistsByEmail = await this.clientService.findByEmail(email)
    if(clientExists){
      throw new UnauthorizedException({message :"Cliente com este Cpf já cadastrado. Deseja continuar?"})
    } else if (clientExistsByEmail){
      throw new UnauthorizedException({message :"Cliente com este email já cadastrado. Deseja continuar?"})
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