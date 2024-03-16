import { Body, Controller, Get, InternalServerErrorException, Post, Put, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { RequestCreateClient } from "src/Clients/dto/create-client";
import { ClientService } from "src/Clients/Client.service";
import { UpdateClientDTO } from "./interfaces/interface";
import { UserInsideToken } from "./interfaces/token";
import { PrismaService } from "src/database/prisma.service";
import { AuthGuard } from "src/auth/auth.guard";



interface QueryRequest extends Request {
  query : {q : string} 
  user : UserInsideToken
}
@Controller("clients")
export class ClientsControllers {

  constructor(private clientService : ClientService, private prismaService : PrismaService) {}
  
  @UseGuards(AuthGuard)
  @Post("create")
  async createClient(@Req() req : RequestCreateClient) {
    const { body , user : {user_id } } = req
    const { email, cpf } = body
    const clientExists = await this.clientService.findByCpf(cpf)

    const clientExistsByEmail = await this.clientService.findByEmail(email)
    
    if(clientExists){
      throw new UnauthorizedException({message :"Cliente com este Cpf já cadastrado. Deseja continuar?"})
    } else if (clientExistsByEmail){
      throw new UnauthorizedException({message :"Cliente com este email já cadastrado. Deseja continuar?"})
    }
    const client = await this.prismaService.clients.create({
      data : {
       ...body,
        created_by : user_id
      }
    })
    
    return {client}

  }


  @Post("force-create") //this route can be called when an unathorizedException is thrown
  async acceptCondition(@Req() req : RequestCreateClient) {
    const { body } = req
    const { user:  { user_id } } = req
    const client = await this.clientService.createClient(body, user_id)
    return {client}
  }
  @Get("view")
  async viewClient(@Req() req : QueryRequest) {
    const { q } = req.query
    const user = req.user
    console.log(user)
    const clients = await this.clientService.queryClients(q)
    return {
      clients,
      userLogged : user
    }
  }
  @Get("viewlatest")
  async viewLatestClients(@Req() data : {user : UserInsideToken}) {
    const { user : {email ,user_id ,username} } = data
    const queryLatestClients = await this.clientService.viewLatestClients()
  } 
  @Put("/update")
  async updateClient(@Body() updateDTO : UpdateClientDTO) {
    try {
      if(updateDTO.cpf) {
        const cpfAlreadyExits = await this.clientService.findByCpf(updateDTO.cpf)
        if(cpfAlreadyExits)throw new UnauthorizedException("Já existe um cliente com este cpf, deseja sobrescrever?")
      }
      if(updateDTO.email) {
        const emailAlreadyInUse = await this.clientService.findByEmail(updateDTO.email)
        if(emailAlreadyInUse)throw new UnauthorizedException("Já existe um cliente com este E-mail, deseja sobrescrever?")

      }
      return await this.clientService.queryClients(updateDTO.client_id)
    } catch (e) {
      throw new InternalServerErrorException(e)
    }
   
  }
}