import { Module } from "@nestjs/common";
import { UserControllers } from "./User.controler";
import { UserService } from "./User-service";

@Module({
  controllers : [UserControllers],
  providers : [UserService]
  
})
export class UserModules {

}